package pushdispatch

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"log"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/fcm"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/webpush"
)

// NO REAL SENDS: every request leaves through rewrite, which points it at a local test server
// whatever host it names (fcm.googleapis.com, oauth2.googleapis.com, a push service).

type rewrite struct {
	target *url.URL
	mu     sync.Mutex
	hosts  []string
}

func (rw *rewrite) RoundTrip(req *http.Request) (*http.Response, error) {
	rw.mu.Lock()
	rw.hosts = append(rw.hosts, req.URL.Host)
	rw.mu.Unlock()
	out := req.Clone(req.Context())
	out.URL.Scheme, out.URL.Host, out.Host = rw.target.Scheme, rw.target.Host, ""
	out.Header.Set("X-Original-Host", req.URL.Host)
	return http.DefaultTransport.RoundTrip(out)
}

func (rw *rewrite) seen() []string {
	rw.mu.Lock()
	defer rw.mu.Unlock()
	return append([]string{}, rw.hosts...)
}

// testClient is the production client's shape (no redirects followed) over rewrite.
func testClient(srv *httptest.Server) (*http.Client, *rewrite) {
	u, _ := url.Parse(srv.URL)
	rw := &rewrite{target: u}
	return &http.Client{Transport: rw, Timeout: 5 * time.Second, CheckRedirect: httpClient.CheckRedirect}, rw
}

// captureStdLog collects what push.Deliver logs (it writes to the standard logger).
func captureStdLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := log.Writer()
	log.SetOutput(&buf)
	t.Cleanup(func() { log.SetOutput(prev) })
	return &buf
}

func strPtr(s string) *string { return &s }

// ---- web push ----

type browser struct {
	priv    *ecdh.PrivateKey
	authRaw []byte
	device  push.Device
}

func newBrowser(t *testing.T, id, endpoint string) browser {
	t.Helper()
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	rand.Read(auth)
	p256dh := base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes())
	a := base64.RawURLEncoding.EncodeToString(auth)
	return browser{priv: priv, authRaw: auth, device: push.Device{DeviceID: id, Platform: "web",
		WebEndpoint: &endpoint, WebP256dh: &p256dh, WebAuth: &a}}
}

// decrypt is the browser's side of RFC 8291 (package webpush's tests pin the RFC vectors).
func (b browser) decrypt(body []byte) ([]byte, error) {
	if len(body) < 86+17 {
		return nil, errors.New("short")
	}
	asPub, err := ecdh.P256().NewPublicKey(body[21:86])
	if err != nil {
		return nil, err
	}
	secret, _ := b.priv.ECDH(asPub)
	prkKey, _ := hkdf.Extract(sha256.New, secret, b.authRaw)
	info := append(append([]byte("WebPush: info\x00"), b.priv.PublicKey().Bytes()...), body[21:86]...)
	ikm, _ := hkdf.Expand(sha256.New, prkKey, string(info), 32)
	prk, _ := hkdf.Extract(sha256.New, ikm, body[:16])
	cek, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	padded, err := gcm.Open(nil, nonce, body[86:], nil)
	if err != nil || len(padded) == 0 || padded[len(padded)-1] != 0x02 {
		return nil, errors.New("does not decrypt")
	}
	return padded[:len(padded)-1], nil
}

type vapidKeys struct {
	pub []byte
	cfg vapidConfig
}

func newVapidKeys(t *testing.T) vapidKeys {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	priv, _ := k.Bytes()
	pub, _ := k.PublicKey.Bytes()
	enc := base64.RawURLEncoding.EncodeToString
	return vapidKeys{pub: pub,
		cfg: vapidConfig{publicKey: enc(pub), privateKey: enc(priv), subject: "mailto:gyasi.messages@adventures.story-tail.com"}}
}

type pushRequest struct {
	host, path string
	header     http.Header
	body       []byte
}

type fakePushService struct {
	srv *httptest.Server
	mu  sync.Mutex
	got []pushRequest
}

func (f *fakePushService) requests() []pushRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]pushRequest{}, f.got...)
}

// newPushService is a fake push service that answers each path with status[path] (201 by
// default), with a body longer than is ever read.
func newPushService(t *testing.T, status map[string]int) *fakePushService {
	t.Helper()
	f := &fakePushService{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.got = append(f.got, pushRequest{host: r.Header.Get("X-Original-Host"), path: r.URL.Path, header: r.Header.Clone(), body: body})
		f.mu.Unlock()
		code, ok := status[r.URL.Path]
		if !ok {
			code = 201
		}
		if code >= 300 && code < 400 {
			w.Header().Set("Location", "https://elsewhere.example/steal")
		}
		w.WriteHeader(code)
		w.Write(bytes.Repeat([]byte("z"), 10_000))
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func verifyVAPID(t *testing.T, header string, pub []byte) map[string]any {
	t.Helper()
	tok, k, ok := strings.Cut(strings.TrimPrefix(header, "vapid t="), ", k=")
	if !ok || !strings.HasPrefix(header, "vapid t=") {
		t.Fatalf("Authorization %q", header)
	}
	if k != base64.RawURLEncoding.EncodeToString(pub) {
		t.Errorf("k is not the VAPID public key")
	}
	parts := strings.Split(tok, ".")
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	h := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	pk, _ := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), pub)
	if len(sig) != 64 || !ecdsa.Verify(pk, h[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("the VAPID token does not verify")
	}
	hdr, _ := base64.RawURLEncoding.DecodeString(parts[0])
	if string(hdr) != `{"typ":"JWT","alg":"ES256"}` {
		t.Errorf("JWT header %s", hdr)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var claims map[string]any
	json.Unmarshal(raw, &claims)
	return claims
}

func TestWebSenderPostsWhatABrowserDecrypts(t *testing.T) {
	ps := newPushService(t, nil)
	hc, _ := testClient(ps.srv)
	keys := newVapidKeys(t)
	clock := func() time.Time { return time.Unix(1_800_000_000, 0) }
	ws := newWebSender(context.Background(), keys.cfg, hc, clock)

	b := newBrowser(t, "d1", "https://fcm.googleapis.com/fcm/send/abc:XYZ")
	conv := "0195a2c0-1a00-7000-8000-0000000000b0"
	row := push.ClaimedRow{OutboxID: "o", AgentID: "a", Kind: push.KindMessage, ConversationID: &conv, MessageCount: 2,
		ClientName: strPtr("Jordan <Hayes> & Co"), Preview: strPtr("Is the transfer included?"), LatestCreatedAt: "2026-11-09T14:59:00.123456+00:00"}
	for _, c := range []struct {
		payload        push.Payload
		urgency, topic string
	}{
		{push.MessagePayload(row), "normal", "0195a2c0-1a00-7000-8000-00000000"},
		{push.DismissPayload(conv, nil), "high", "0195a2c0-1a00-7000-8000-00000000"},
		{push.QuoteRequestPayload(push.ClaimedRow{TripID: &conv}), "normal", "quote-0195a2c0-1a00-7000-8000-00"},
	} {
		o, err := ws.send(b.device, c.payload)
		if err != nil || o != push.OutcomeOK {
			t.Fatalf("%s: %s %v", c.payload.PayloadKind(), o, err)
		}
		got := ps.requests()
		r := got[len(got)-1]
		if r.host != "fcm.googleapis.com" || r.path != "/fcm/send/abc:XYZ" {
			t.Errorf("posted to %s%s", r.host, r.path)
		}
		for k, want := range map[string]string{"Ttl": "43200", "Urgency": c.urgency, "Topic": c.topic,
			"Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream"} {
			if r.header.Get(k) != want {
				t.Errorf("%s: %s = %q, want %q", c.payload.PayloadKind(), k, r.header.Get(k), want)
			}
		}
		claims := verifyVAPID(t, r.header.Get("Authorization"), keys.pub)
		if claims["aud"] != "https://fcm.googleapis.com" || claims["sub"] != keys.cfg.subject || claims["exp"] != float64(1_800_043_200) {
			t.Errorf("claims %v", claims)
		}
		plain, err := b.decrypt(r.body)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := js.Marshal(c.payload)
		if !bytes.Equal(plain, want) {
			t.Errorf("decrypted\n %s\nwant\n %s", plain, want)
		}
		if len(r.body) != 86+len(want)+17 {
			t.Errorf("body %d octets", len(r.body))
		}
	}
	// JSON.stringify's bytes: no HTML escaping.
	first, _ := b.decrypt(ps.requests()[0].body)
	if !strings.Contains(string(first), `"title":"Jordan <Hayes> & Co"`) {
		t.Errorf("payload %s", first)
	}
}

func TestWebSenderOutcomes(t *testing.T) {
	ps := newPushService(t, map[string]int{"/gone": 410, "/missing": 404, "/busy": 429, "/moved": 301, "/fail": 500})
	hc, rw := testClient(ps.srv)
	keys := newVapidKeys(t)
	ws := newWebSender(context.Background(), keys.cfg, hc, time.Now)
	payload := push.DismissPayload("c", nil)
	for path, want := range map[string]push.DeviceOutcome{
		"/ok": push.OutcomeOK, "/gone": push.OutcomeGone, "/missing": push.OutcomeGone,
		"/busy": push.OutcomeError, "/moved": push.OutcomeError, "/fail": push.OutcomeError,
	} {
		b := newBrowser(t, "d", "https://updates.push.services.mozilla.com"+path)
		o, err := ws.send(b.device, payload)
		if err != nil || o != want {
			t.Errorf("%s: %s %v", path, o, err)
		}
	}
	// The redirect was not followed: every request went to the push service it named.
	for _, h := range rw.seen() {
		if h != "updates.push.services.mozilla.com" {
			t.Errorf("a request went to %s", h)
		}
	}
	if n := len(ps.requests()); n != 6 {
		t.Errorf("%d requests", n)
	}

	// Refused before any request.
	before := len(rw.seen())
	ok := newBrowser(t, "d", "https://web.push.apple.com/x")
	for name, c := range map[string]struct {
		d    push.Device
		want push.DeviceOutcome
	}{
		"an android device":        {push.Device{Platform: "android"}, push.OutcomeSkipped},
		"no endpoint":              {push.Device{Platform: "web", WebP256dh: ok.device.WebP256dh, WebAuth: ok.device.WebAuth}, push.OutcomeGone},
		"an empty key":             {push.Device{Platform: "web", WebEndpoint: ok.device.WebEndpoint, WebP256dh: strPtr(""), WebAuth: ok.device.WebAuth}, push.OutcomeGone},
		"an endpoint off the list": {push.Device{Platform: "web", WebEndpoint: strPtr("https://10.0.0.1/x"), WebP256dh: ok.device.WebP256dh, WebAuth: ok.device.WebAuth}, push.OutcomeGone},
		"an http endpoint":         {push.Device{Platform: "web", WebEndpoint: strPtr("http://fcm.googleapis.com/x"), WebP256dh: ok.device.WebP256dh, WebAuth: ok.device.WebAuth}, push.OutcomeGone},
	} {
		o, err := ws.send(c.d, payload)
		if err != nil || o != c.want {
			t.Errorf("%s: %s %v", name, o, err)
		}
	}
	// Keys that do not decode are an error (retried), not "gone", as web-push threw.
	if _, err := ws.send(push.Device{Platform: "web", WebEndpoint: ok.device.WebEndpoint, WebP256dh: strPtr("AAAAAAAAAA"), WebAuth: ok.device.WebAuth}, payload); !errors.Is(err, webpush.ErrBadP256dh) {
		t.Errorf("bad p256dh: %v", err)
	}
	if len(rw.seen()) != before {
		t.Errorf("a refused device was sent to")
	}
}

func TestWebSenderBadVAPIDNeverPosts(t *testing.T) {
	ps := newPushService(t, nil)
	hc, rw := testClient(ps.srv)
	keys := newVapidKeys(t)
	other := newVapidKeys(t)
	b := newBrowser(t, "d", "https://fcm.googleapis.com/fcm/send/x")
	for name, cfg := range map[string]vapidConfig{
		"mismatched pair":        {publicKey: other.cfg.publicKey, privateKey: keys.cfg.privateKey, subject: keys.cfg.subject},
		"subject with no mailto": {publicKey: keys.cfg.publicKey, privateKey: keys.cfg.privateKey, subject: "gyasi@example.com"},
		"private key garbage":    {publicKey: keys.cfg.publicKey, privateKey: "!!", subject: keys.cfg.subject},
	} {
		ws := newWebSender(context.Background(), cfg, hc, time.Now)
		o, err := ws.send(b.device, push.DismissPayload("c", nil))
		if err == nil || o != "" {
			t.Errorf("%s: %s %v", name, o, err)
		}
		// A gone device is still gone: the endpoint is checked first, as web-push threw later.
		if o, err := ws.send(push.Device{Platform: "web"}, push.DismissPayload("c", nil)); err != nil || o != push.OutcomeGone {
			t.Errorf("%s: no endpoint %s %v", name, o, err)
		}
	}
	if len(rw.seen()) != 0 {
		t.Errorf("posted with unusable keys: %v", rw.seen())
	}
}

func TestWebSenderUnreachableSaysNoAddress(t *testing.T) {
	ps := newPushService(t, nil)
	hc, _ := testClient(ps.srv)
	ps.srv.Close() // nothing listens now
	ws := newWebSender(context.Background(), newVapidKeys(t).cfg, hc, time.Now)
	b := newBrowser(t, "d", "https://fcm.googleapis.com/fcm/send/secret-device-address")
	_, err := ws.send(b.device, push.DismissPayload("c", nil))
	if !errors.Is(err, errWebUnreachable) || strings.Contains(err.Error(), "secret-device-address") {
		t.Fatalf("got %v", err)
	}
}

func TestTopicFor(t *testing.T) {
	for tag, want := range map[string]string{
		// Dashes are URL-safe, so they stay; the cut at 32 takes the uuid's first 32.
		"0195a2c0-1a00-7000-8000-0000000000b0":      "0195a2c0-1a00-7000-8000-00000000",
		"summary":                                   "summary",
		"lead-0195a2c0-1a00-7000-8000-0000000000b0": "lead-0195a2c0-1a00-7000-8000-000",
		"":                       "",
		"a b.c/d\U000000e9e_f-g": "abcde_f-g",
	} {
		if got := topicFor(push.DismissPayload(tag, nil)); got != want {
			t.Errorf("%q: %q, want %q", tag, got, want)
		}
	}
}

// ---- FCM ----

type fakeGoogle struct {
	srv       *httptest.Server
	exchanges atomic.Int32
	sends     atomic.Int32
	issued    atomic.Int32
	mu        sync.Mutex
	forms     []url.Values
	sent      []pushRequest
	// tokenStatus, sendStatus and sendBody answer the next requests.
	tokenStatus atomic.Int32
	sendStatus  atomic.Int32
	sendBody    atomic.Value // string
	delay       time.Duration
}

func newFakeGoogle(t *testing.T, delay time.Duration) *fakeGoogle {
	t.Helper()
	g := &fakeGoogle{delay: delay}
	g.tokenStatus.Store(200)
	g.sendStatus.Store(200)
	g.sendBody.Store(`{"name":"projects/p/messages/1"}`)
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		switch {
		case r.Header.Get("X-Original-Host") == "oauth2.googleapis.com" && r.URL.Path == "/token":
			g.exchanges.Add(1)
			if g.delay > 0 {
				time.Sleep(g.delay)
			}
			form, _ := url.ParseQuery(string(body))
			g.mu.Lock()
			g.forms = append(g.forms, form)
			g.mu.Unlock()
			if s := int(g.tokenStatus.Load()); s != 200 {
				w.WriteHeader(s)
				w.Write([]byte(`{"error":"invalid_grant"}`))
				return
			}
			n := g.issued.Add(1)
			w.Write([]byte(`{"access_token":"ya29.token-` + string(rune('0'+n)) + `","expires_in":3599,"token_type":"Bearer"}`))
		case r.Header.Get("X-Original-Host") == "fcm.googleapis.com":
			g.sends.Add(1)
			g.mu.Lock()
			g.sent = append(g.sent, pushRequest{path: r.URL.EscapedPath(), header: r.Header.Clone(), body: body})
			g.mu.Unlock()
			w.WriteHeader(int(g.sendStatus.Load()))
			w.Write([]byte(g.sendBody.Load().(string)))
		default:
			w.WriteHeader(418)
		}
	}))
	t.Cleanup(g.srv.Close)
	return g
}

var (
	rsaOnce sync.Once
	rsaKey  *rsa.PrivateKey
)

func testServiceAccount(t *testing.T, project string) serviceAccount {
	t.Helper()
	rsaOnce.Do(func() {
		k, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			panic(err)
		}
		rsaKey = k
	})
	der, _ := x509.MarshalPKCS8PrivateKey(rsaKey)
	p := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	return serviceAccount{ServiceAccount: fcm.ServiceAccount{ProjectID: project,
		ClientEmail: "push@" + project + ".iam.gserviceaccount.com", PrivateKey: p}, usable: true}
}

func phone(id, token string) push.Device {
	return push.Device{DeviceID: id, Platform: "android", FCMToken: &token}
}

func TestFCMSenderSendsADataMessage(t *testing.T) {
	g := newFakeGoogle(t, 0)
	hc, rw := testClient(g.srv)
	var logs bytes.Buffer
	clock := func() time.Time { return time.Unix(1_800_000_000, 0) }
	sa := testServiceAccount(t, "sta app/1")
	s := newFCMSender(context.Background(), sa, hc, &tokenCache{}, clock, slog.New(slog.NewTextHandler(&logs, nil)))

	conv := "0195a2c0-1a00-7000-8000-0000000000b0"
	payload := push.MessagePayload(push.ClaimedRow{Kind: push.KindMessage, ConversationID: &conv, MessageCount: 3,
		ClientName: strPtr("Jordan Hayes"), Preview: strPtr("secret words"), LatestCreatedAt: "2026-11-09T14:59:00.123456+00:00"})
	o, err := s.send(phone("p1", "fcm-token-abc"), payload)
	if err != nil || o != push.OutcomeOK {
		t.Fatalf("%s %v", o, err)
	}
	if got := strings.Join(rw.seen(), ","); got != "oauth2.googleapis.com,fcm.googleapis.com" {
		t.Errorf("hosts %s", got)
	}
	// The token exchange: RFC 7523, an RS256 assertion that verifies with the account's key.
	form := g.forms[0]
	if form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
		t.Errorf("grant_type %q", form.Get("grant_type"))
	}
	parts := strings.Split(form.Get("assertion"), ".")
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(&rsaKey.PublicKey, crypto.SHA256, digest[:], sig); err != nil {
		t.Errorf("assertion: %v", err)
	}
	claims, _ := base64.RawURLEncoding.DecodeString(parts[1])
	want := `{"iss":"push@sta app/1.iam.gserviceaccount.com","scope":"https://www.googleapis.com/auth/firebase.messaging","aud":"https://oauth2.googleapis.com/token","iat":1800000000,"exp":1800003600}`
	if string(claims) != want {
		t.Errorf("claims %s", claims)
	}
	// The send: encodeURIComponent(project_id), the bearer, and fcm.FCMMessage's bytes.
	r := g.sent[0]
	if r.path != "/v1/projects/sta%20app%2F1/messages:send" {
		t.Errorf("path %s", r.path)
	}
	if r.header.Get("Authorization") != "Bearer ya29.token-1" || r.header.Get("Content-Type") != "application/json" {
		t.Errorf("headers %v", r.header)
	}
	wantBody, _ := js.Marshal(fcm.FCMMessage("fcm-token-abc", payload))
	if !bytes.Equal(r.body, wantBody) {
		t.Errorf("body\n %s\nwant\n %s", r.body, wantBody)
	}
	if bytes.Contains(r.body, []byte("Jordan")) || bytes.Contains(r.body, []byte("secret")) {
		t.Error("words reached Google")
	}
	if logs.Len() != 0 {
		t.Errorf("logged on success: %s", logs.String())
	}
}

func TestFCMOutcomesAndTheTokenCache(t *testing.T) {
	g := newFakeGoogle(t, 0)
	hc, _ := testClient(g.srv)
	var logs bytes.Buffer
	now := time.Unix(1_800_000_000, 0)
	clock := func() time.Time { return now }
	cache := &tokenCache{}
	s := newFCMSender(context.Background(), testServiceAccount(t, "p"), hc, cache, clock, slog.New(slog.NewTextHandler(&logs, nil)))
	d := phone("p1", "tok-123")
	msg := push.DismissPayload("c", strPtr("2026-11-09T14:59:00+00:00"))

	send := func(status int, body string) push.DeviceOutcome {
		t.Helper()
		g.sendStatus.Store(int32(status))
		g.sendBody.Store(body)
		o, err := s.send(d, msg)
		if err != nil {
			t.Fatalf("status %d: %v", status, err)
		}
		return o
	}
	if o := send(200, `{}`); o != push.OutcomeOK {
		t.Errorf("200: %s", o)
	}
	if o := send(404, `{"error":{"code":404,"status":"NOT_FOUND","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}`); o != push.OutcomeGone {
		t.Errorf("UNREGISTERED: %s", o)
	}
	// A bare 404 is not enough: FCM says 404 for a wrong project too.
	if o := send(404, `{"error":{"code":404,"status":"NOT_FOUND"}}`); o != push.OutcomeError {
		t.Errorf("bare 404: %s", o)
	}
	if o := send(400, `{"error":{"details":[{"@type":"x"},{"errorCode":"INVALID_ARGUMENT"}]}}`); o != push.OutcomeError {
		t.Errorf("400: %s", o)
	}
	if g.exchanges.Load() != 1 {
		t.Errorf("%d exchanges for four sends", g.exchanges.Load())
	}
	// A 401 forgets the token: the next send exchanges afresh.
	if o := send(401, `not json`); o != push.OutcomeError {
		t.Errorf("401: %s", o)
	}
	send(200, `{}`)
	if g.exchanges.Load() != 2 {
		t.Errorf("%d exchanges after a 401", g.exchanges.Load())
	}
	// Up to 49 minutes on, still cached; past that (60 s before the 50-minute life ends),
	// renewed.
	now = now.Add(48*time.Minute + 59*time.Second)
	send(200, `{}`)
	if g.exchanges.Load() != 2 {
		t.Errorf("renewed too early")
	}
	now = now.Add(2 * time.Second)
	send(200, `{}`)
	if g.exchanges.Load() != 3 {
		t.Errorf("not renewed at 49 minutes")
	}
	// Another service account never reuses this one's token.
	other := newFCMSender(context.Background(), testServiceAccount(t, "other-project"), hc, cache, clock, quietLog())
	if _, err := other.send(d, msg); err != nil {
		t.Fatal(err)
	}
	if g.exchanges.Load() != 4 {
		t.Errorf("a token was shared across service accounts")
	}
	// The log carries status and code only.
	for _, secret := range []string{"tok-123", "ya29", "NOT_FOUND", "readUpTo"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("the log carries %q: %s", secret, logs.String())
		}
	}
	if !strings.Contains(logs.String(), "status=404 code=UNREGISTERED") || !strings.Contains(logs.String(), "status=400 code=INVALID_ARGUMENT") {
		t.Errorf("log: %s", logs.String())
	}
}

func TestFCMExchangeFailures(t *testing.T) {
	g := newFakeGoogle(t, 0)
	hc, _ := testClient(g.srv)
	s := newFCMSender(context.Background(), testServiceAccount(t, "p"), hc, &tokenCache{}, time.Now, quietLog())
	g.tokenStatus.Store(400)
	for i := 0; i < 2; i++ {
		_, err := s.send(phone("p1", "t"), push.DismissPayload("c", nil))
		if err == nil || err.Error() != "FCM token exchange failed: 400" {
			t.Fatalf("got %v", err)
		}
	}
	// A failed exchange is not remembered for the hour.
	if g.exchanges.Load() != 2 || g.sends.Load() != 0 {
		t.Errorf("exchanges %d sends %d", g.exchanges.Load(), g.sends.Load())
	}
	g.tokenStatus.Store(200)
	if o, err := s.send(phone("p1", "t"), push.DismissPayload("c", nil)); err != nil || o != push.OutcomeOK {
		t.Errorf("after recovery: %s %v", o, err)
	}

	// An unusable key: an error for every Android send, and nothing posted.
	before := g.exchanges.Load()
	bad := serviceAccount{ServiceAccount: fcm.ServiceAccount{ProjectID: "p", ClientEmail: "e", PrivateKey: "not a key"}, usable: true}
	if _, err := newFCMSender(context.Background(), bad, hc, &tokenCache{}, time.Now, quietLog()).send(phone("p1", "t"), push.DismissPayload("c", nil)); !errors.Is(err, errSAUnusable) {
		t.Errorf("bad key: %v", err)
	}
	notText := serviceAccount{usable: false}
	if _, err := newFCMSender(context.Background(), notText, hc, &tokenCache{}, time.Now, quietLog()).send(phone("p1", "t"), push.DismissPayload("c", nil)); !errors.Is(err, errSAUnusable) {
		t.Errorf("fields not text: %v", err)
	}
	if g.exchanges.Load() != before {
		t.Error("an unusable key reached Google")
	}
	// Not a phone, or a phone with no token.
	if o, _ := s.send(push.Device{Platform: "web"}, push.DismissPayload("c", nil)); o != push.OutcomeSkipped {
		t.Errorf("web: %s", o)
	}
	if o, _ := s.send(push.Device{Platform: "android"}, push.DismissPayload("c", nil)); o != push.OutcomeGone {
		t.Errorf("no token: %s", o)
	}
	if o, _ := s.send(phone("p", ""), push.DismissPayload("c", nil)); o != push.OutcomeGone {
		t.Errorf("empty token: %s", o)
	}
}

// Many phones at once share one exchange (the cache holds the exchange in flight). Run with
// -race.
func TestFCMOneExchangeForAPass(t *testing.T) {
	g := newFakeGoogle(t, 50*time.Millisecond)
	hc, _ := testClient(g.srv)
	s := newFCMSender(context.Background(), testServiceAccount(t, "p"), hc, &tokenCache{}, time.Now, quietLog())
	devices := make([]push.Device, 24)
	for i := range devices {
		devices[i] = phone(string(rune('a'+i)), "token-"+string(rune('a'+i)))
	}
	stdlog := captureStdLog(t)
	result := push.Deliver(devices, push.DismissPayload("c", nil), s.send)
	if !result.OK || g.exchanges.Load() != 1 || g.sends.Load() != 24 {
		t.Fatalf("ok=%v exchanges=%d sends=%d log=%s", result.OK, g.exchanges.Load(), g.sends.Load(), stdlog)
	}
}

func TestTokenCacheWaitersShareAFailure(t *testing.T) {
	c := &tokenCache{}
	release := make(chan struct{})
	var calls atomic.Int32
	fetch := func(context.Context) (string, error) {
		calls.Add(1)
		<-release
		return "", errors.New("FCM token exchange failed: 500")
	}
	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = c.get(context.Background(), "k", time.Unix(0, 0), fetch)
		}()
	}
	time.Sleep(20 * time.Millisecond)
	close(release)
	wg.Wait()
	for _, err := range errs {
		if err == nil {
			t.Fatal("a waiter got no error")
		}
	}
	c.mu.Lock()
	cached := c.cur
	c.mu.Unlock()
	if cached != nil {
		t.Errorf("a failed exchange stayed cached (%d calls)", calls.Load())
	}
}

func TestEncodeURIComponent(t *testing.T) {
	for in, want := range map[string]string{
		"story-tail-prod":        "story-tail-prod",
		"a b/c?d&e=f:g@h#i+j,k;": "a%20b%2Fc%3Fd%26e%3Df%3Ag%40h%23i%2Bj%2Ck%3B",
		"-_.!~*'()":              "-_.!~*'()",
		"\U000000e9":             "%C3%A9",
	} {
		if got := encodeURIComponent(in); got != want {
			t.Errorf("%q: %q, want %q", in, got, want)
		}
	}
}

// End to end over every sender at once: a pass with web, Android and iOS devices, the keys
// set, sends going only to the fakes, and nothing secret in any log line.
func TestAPassThroughTheRealSenders(t *testing.T) {
	g := newFakeGoogle(t, 0)
	hc, rw := testClient(g.srv)
	keys := newVapidKeys(t)
	sa := testServiceAccount(t, "p")
	saJSON, _ := json.Marshal(map[string]string{"project_id": sa.ProjectID, "client_email": sa.ClientEmail, "private_key": sa.PrivateKey})
	env := map[string]string{"VAPID_PUBLIC_KEY": keys.cfg.publicKey, "VAPID_PRIVATE_KEY": keys.cfg.privateKey,
		"VAPID_SUBJECT": keys.cfg.subject, "FCM_SERVICE_ACCOUNT_JSON": string(saJSON)}
	b := newBrowser(t, "web-1", "https://fcm.googleapis.com/fcm/send/browser-address")
	devices, _ := json.Marshal([]any{
		map[string]any{"device_id": "web-1", "platform": "web", "fcm_token": nil, "web_endpoint": *b.device.WebEndpoint,
			"web_p256dh": *b.device.WebP256dh, "web_auth": *b.device.WebAuth},
		map[string]any{"device_id": "phone-1", "platform": "android", "fcm_token": "fcm-device-token", "web_endpoint": nil, "web_p256dh": nil, "web_auth": nil},
		map[string]any{"device_id": "ios-1", "platform": "ios", "fcm_token": "apns", "web_endpoint": nil, "web_p256dh": nil, "web_auth": nil},
	})
	db := &fakeDB{replies: map[string]string{
		"push_claim_dismissals":  `[]`,
		"push_devices_for_agent": string(devices),
		"push_claim_due": `[{"outbox_id":"o-1","agent_id":"a","kind":"message","conversation_id":"c-1","held":false,"message_count":1,
		  "client_name":"Jordan Hayes","trip_title":null,"preview":"the secret words","latest_created_at":"2026-11-09T14:59:00+00:00"}]`,
	}}
	var logs bytes.Buffer
	stdlog := captureStdLog(t)
	reply, err := serve(deps(env, &logs), post(), db, hc, &tokenCache{})
	if err != nil {
		t.Fatal(err)
	}
	out, _ := js.Marshal(reply.Body)
	if string(out) != `{"sent":1,"retried":0,"dismissed":0,"gone":0}` {
		t.Errorf("reply %s", out)
	}
	hosts := strings.Join(rw.seen(), ",")
	if strings.Count(hosts, "fcm.googleapis.com") != 2 || strings.Count(hosts, "oauth2.googleapis.com") != 1 || len(rw.seen()) != 3 {
		t.Errorf("hosts %s", hosts)
	}
	all := logs.String() + stdlog.String()
	for _, secret := range []string{"browser-address", "fcm-device-token", "secret words", "Jordan", *b.device.WebP256dh, "ya29"} {
		if strings.Contains(all, secret) {
			t.Errorf("a log line carries %q:\n%s", secret, all)
		}
	}
}
