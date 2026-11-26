//go:build difftest && difftest_background

package difftest

import (
	"bytes"
	"context"
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
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/pushdispatch"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// TestPushDispatchGoAgainstTheStack runs the Go dispatcher, with keys, against this stack's
// real push_* SQL: the claim, the finish, the dismissal claim and the device cleanup, which the
// differential cases cannot reach (Deno has no keys here). Deno is not involved, so this is not
// a comparison: it pins the row transitions the SQL makes for what Go asks.
//
// NOTHING IS SENT. The client's transport answers in process for oauth2.googleapis.com,
// fcm.googleapis.com (FCM and Chrome's push service): no connection is ever opened. It
// decrypts each web push with the test browser's key, so the encryption is checked end to end
// too. Any other host is refused.
func TestPushDispatchGoAgainstTheStack(t *testing.T) {
	ctx := context.Background()
	tag := Unique()
	agent := S.NewAgent(t, tag)
	traveler := S.NewTraveler(t, tag, agent)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}

	// A sent message notification the advisor has since read: a dismiss is owed. The thread's
	// message is the advisor's own (a client's would queue an alert email for another test's
	// dispatcher), and both go in before any device exists, so no trigger queues anything.
	conv, msg := uuid.New(), uuid.New()
	must(S.DB.From("conversation").Insert(ctx, js.O("id", conv, "client_id", traveler.ClientID, "agent_id", agent.AgentID,
		"subject", "Push fixture", "client_unread_count", 0, "agent_unread_count", 0), nil))
	must(S.DB.From("message").Insert(ctx, js.O("id", msg, "conversation_id", conv, "sender_user_id", agent.PlatformUserID,
		"sender_role", "agent", "body", "Fixture", "created_at", "2026-11-06T10:00:00.123456Z"), nil))
	lead1, lead2 := uuid.New(), uuid.New()
	for i, id := range []string{lead1, lead2} {
		must(S.DB.From("lead").Insert(ctx, js.O("id", id, "agent_id", agent.AgentID, "email",
			"difftest-push-"+tag+"-"+string(rune('a'+i))+"@example.com", "first_name", []string{"Sam", "Rae"}[i], "source", "website"), nil))
	}
	t.Cleanup(func() {
		c := context.Background()
		_ = S.DB.From("push_outbox").Eq("agent_id", agent.AgentID).Delete(c, nil)
		_ = S.DB.From("push_device").Eq("platform_user_id", agent.PlatformUserID).Delete(c, nil)
		_ = S.DB.From("lead").In("id", []string{lead1, lead2}).Delete(c, nil)
		_ = S.DB.From("message").Eq("conversation_id", conv).Delete(c, nil)
		_ = S.DB.From("conversation").Eq("id", conv).Delete(c, nil)
	})

	// Three devices: a browser, a phone, and a phone FCM says is gone.
	browser, err := ecdh.P256().GenerateKey(rand.Reader)
	must(err)
	authSecret := make([]byte, 16)
	rand.Read(authSecret)
	enc := base64.RawURLEncoding.EncodeToString
	webID, phoneID, deadID := uuid.New(), uuid.New(), uuid.New()
	must(S.DB.From("push_device").Insert(ctx, js.O("id", webID, "platform_user_id", agent.PlatformUserID, "platform", "web",
		"web_endpoint", "https://fcm.googleapis.com/fcm/send/difftest-"+tag+"-browser", "web_p256dh", enc(browser.PublicKey().Bytes()),
		"web_auth", enc(authSecret)), nil))
	must(S.DB.From("push_device").Insert(ctx, js.O("id", phoneID, "platform_user_id", agent.PlatformUserID, "platform", "android",
		"fcm_token", "difftest-"+tag+"-phone:APA91b"), nil))
	must(S.DB.From("push_device").Insert(ctx, js.O("id", deadID, "platform_user_id", agent.PlatformUserID, "platform", "android",
		"fcm_token", "difftest-"+tag+"-dead:APA91b"), nil))

	past := js.ISOString(time.Now().Add(-time.Minute))
	liveID, heldID, sentID := uuid.New(), uuid.New(), uuid.New()
	must(S.DB.From("push_outbox").Insert(ctx, js.O("id", liveID, "agent_id", agent.AgentID, "kind", "lead_message",
		"lead_id", lead1, "message_count", 1, "due_at", past, "held", false), nil))
	must(S.DB.From("push_outbox").Insert(ctx, js.O("id", heldID, "agent_id", agent.AgentID, "kind", "lead_message",
		"lead_id", lead2, "message_count", 1, "due_at", past, "held", true, "hold_reason", "rest"), nil))
	must(S.DB.From("push_outbox").Insert(ctx, js.O("id", sentID, "agent_id", agent.AgentID, "kind", "message",
		"conversation_id", conv, "latest_message_id", msg, "message_count", 1, "due_at", past, "held", false,
		"state", "sent", "sent_at", past, "needs_dismiss", true), nil))

	// The fake services.
	vapidKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	must(err)
	vapidPriv, _ := vapidKey.Bytes()
	vapidPub, _ := vapidKey.PublicKey.Bytes()
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	must(err)
	der, _ := x509.MarshalPKCS8PrivateKey(rsaKey)
	sa, _ := json.Marshal(map[string]string{"type": "service_account", "project_id": "difftest-" + tag,
		"client_email": "push@difftest.iam.gserviceaccount.com",
		"private_key":  string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))})
	env := map[string]string{"VAPID_PUBLIC_KEY": enc(vapidPub), "VAPID_PRIVATE_KEY": enc(vapidPriv),
		"VAPID_SUBJECT": "mailto:difftest@example.com", "FCM_SERVICE_ACCOUNT_JSON": string(sa)}
	fake := &pushFakeServices{browser: browser, auth: authSecret, tag: tag}

	fn := pushdispatch.New(pushdispatch.Options{HTTP: &http.Client{Transport: fake, Timeout: 10 * time.Second}})
	deps := &edge.Deps{DB: S.DB, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Now: time.Now,
		Env: func(k string) string { return env[k] }}
	reply, err := fn(deps, httptest.NewRequest("POST", "/functions/v1/push-dispatch", strings.NewReader(`{"trigger":"cron"}`)))
	must(err)
	out, _ := js.Marshal(reply.Body)
	if string(out) != `{"sent":2,"retried":0,"dismissed":1,"gone":1}` {
		t.Errorf("reply %s", out)
	}

	// What went where. The dismiss goes to phones only and first, so the dead phone hears it,
	// says it is gone, and is never tried again.
	fake.mu.Lock()
	got := strings.Join(fake.log, "\n")
	fake.mu.Unlock()
	t.Logf("what the fake services were asked:\n%s", got)
	for _, want := range []string{
		"token exchange",
		"fcm phone dismiss tag=" + conv + " readUpTo=2026-11-06T10:00:00.123456+00:00",
		"fcm dead dismiss tag=" + conv,
		"fcm phone lead_message tag=lead-" + lead1,
		"fcm phone summary tag=summary",
		"web lead_message tag=lead-" + lead1 + ` title="New note from Sam"`,
		"web summary tag=summary" + ` title="1 note from someone new while you rested"`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in:\n%s", want, got)
		}
	}
	if n := strings.Count(got, "\n") + 1; n != 7 || strings.Count(got, "token exchange") != 1 || strings.Contains(got, "refused") {
		t.Errorf("%d requests:\n%s", n, got)
	}

	// The rows the SQL left.
	var rows []struct {
		ID           string  `json:"id"`
		State        string  `json:"state"`
		Attempts     int64   `json:"attempts"`
		ClaimedAt    *string `json:"claimed_at"`
		SentAt       *string `json:"sent_at"`
		NeedsDismiss bool    `json:"needs_dismiss"`
	}
	must(S.DB.From("push_outbox").Select("id,state,attempts,claimed_at,sent_at,needs_dismiss").Eq("agent_id", agent.AgentID).Rows(ctx, &rows))
	byID := map[string]string{}
	for _, r := range rows {
		byID[r.ID] = r.State
		switch r.ID {
		case liveID, heldID:
			if r.State != "sent" || r.Attempts != 0 || r.ClaimedAt == nil || r.SentAt == nil || r.NeedsDismiss {
				t.Errorf("due row %s: %+v", r.ID, r)
			}
		case sentID:
			if r.State != "sent" || r.NeedsDismiss {
				t.Errorf("dismissed row: %+v", r)
			}
		}
	}
	if len(rows) != 3 {
		t.Errorf("%d outbox rows: %v", len(rows), byID)
	}
	var devices []struct {
		ID string `json:"id"`
	}
	must(S.DB.From("push_device").Select("id").Eq("platform_user_id", agent.PlatformUserID).Order("id", true).Rows(ctx, &devices))
	left := map[string]bool{}
	for _, d := range devices {
		left[d.ID] = true
	}
	if len(devices) != 2 || !left[webID] || !left[phoneID] || left[deadID] {
		t.Errorf("devices left: %v (the dead phone must be gone, the others kept)", devices)
	}

	// A second pass finds nothing of ours to do.
	reply, err = fn(deps, httptest.NewRequest("POST", "/functions/v1/push-dispatch", nil))
	must(err)
	out, _ = js.Marshal(reply.Body)
	if string(out) != `{"sent":0,"retried":0,"dismissed":0,"gone":0}` {
		t.Errorf("second pass %s", out)
	}
}

// pushFakeServices answers for Google's token endpoint, FCM and Chrome's push service, in
// process, and logs what each was asked (kinds and tags only).
type pushFakeServices struct {
	browser *ecdh.PrivateKey
	auth    []byte
	tag     string
	mu      sync.Mutex
	log     []string
}

func (f *pushFakeServices) note(s string) {
	f.mu.Lock()
	f.log = append(f.log, s)
	f.mu.Unlock()
}

func pushReply(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Status: http.StatusText(status), Header: http.Header{"Content-Type": {"application/json"}},
		Body: io.NopCloser(strings.NewReader(body)), ProtoMajor: 1, ProtoMinor: 1}
}

func (f *pushFakeServices) RoundTrip(req *http.Request) (*http.Response, error) {
	body, _ := io.ReadAll(req.Body)
	switch {
	case req.URL.Host == "oauth2.googleapis.com" && req.URL.Path == "/token":
		f.note("token exchange")
		return pushReply(200, `{"access_token":"difftest-access","expires_in":3599}`), nil
	case req.URL.Host == "fcm.googleapis.com" && strings.HasPrefix(req.URL.Path, "/v1/projects/difftest-"+f.tag+"/"):
		if req.Header.Get("Authorization") != "Bearer difftest-access" {
			return pushReply(401, `{}`), nil
		}
		var m struct {
			Message struct {
				Token string            `json:"token"`
				Data  map[string]string `json:"data"`
			} `json:"message"`
		}
		_ = json.Unmarshal(body, &m)
		who := "phone"
		if strings.Contains(m.Message.Token, "-dead") {
			who = "dead"
		}
		line := "fcm " + who + " " + m.Message.Data["kind"] + " tag=" + m.Message.Data["tag"]
		if r, ok := m.Message.Data["readUpTo"]; ok {
			line += " readUpTo=" + r
		}
		f.note(line)
		if who == "dead" {
			return pushReply(404, `{"error":{"code":404,"details":[{"errorCode":"UNREGISTERED"}]}}`), nil
		}
		return pushReply(200, `{"name":"projects/x/messages/1"}`), nil
	case req.URL.Host == "fcm.googleapis.com" && req.URL.Path == "/fcm/send/difftest-"+f.tag+"-browser":
		plain, err := pushDecrypt(body, f.browser, f.auth)
		if err != nil || !strings.HasPrefix(req.Header.Get("Authorization"), "vapid t=") {
			f.note("web refused: " + errString(err))
			return pushReply(400, ``), nil
		}
		var p struct {
			Kind, Tag, Title string
		}
		_ = json.Unmarshal(plain, &p)
		f.note("web " + p.Kind + " tag=" + p.Tag + ` title="` + p.Title + `"`)
		return pushReply(201, ``), nil
	}
	f.note("refused " + req.URL.Host)
	return nil, errors.New("pushFakeServices: no such service")
}

func errString(err error) string {
	if err == nil {
		return "no vapid header"
	}
	return err.Error()
}

// pushDecrypt is the browser's side of RFC 8291 (internal/domain/webpush pins the RFC vectors).
func pushDecrypt(body []byte, ua *ecdh.PrivateKey, auth []byte) ([]byte, error) {
	if len(body) < 86+17 || body[20] != 65 {
		return nil, errors.New("short")
	}
	asPub, err := ecdh.P256().NewPublicKey(body[21:86])
	if err != nil {
		return nil, err
	}
	secret, _ := ua.ECDH(asPub)
	prkKey, _ := hkdf.Extract(sha256.New, secret, auth)
	info := append(append([]byte("WebPush: info\x00"), ua.PublicKey().Bytes()...), body[21:86]...)
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
	return bytes.TrimSuffix(padded, []byte{0x02}), nil
}
