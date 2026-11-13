package webpush

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math/big"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// The RFC values are read from testdata/, which holds the RFC text itself (copied verbatim),
// so no value in this file is retyped by hand (the review's T1 rule).

func readRFC(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// after returns the text after each marker in turn.
func after(t *testing.T, text string, markers ...string) string {
	t.Helper()
	for _, m := range markers {
		i := strings.Index(text, m)
		if i < 0 {
			t.Fatalf("marker %q not found", m)
		}
		text = text[i+len(m):]
	}
	return text
}

// b64Block is the base64url value that starts after the markers and runs to the next blank
// line, its wrapping and spaces removed (the RFCs wrap values for presentation).
func b64Block(t *testing.T, text string, markers ...string) []byte {
	t.Helper()
	rest := strings.TrimLeft(after(t, text, markers...), " \n")
	if i := strings.Index(rest, "\n\n"); i >= 0 {
		rest = rest[:i]
	}
	return mustB64(t, rest)
}

// b64Until is the value after the markers up to end.
func b64Until(t *testing.T, text, end string, markers ...string) []byte {
	t.Helper()
	rest := after(t, text, markers...)
	i := strings.Index(rest, end)
	if i < 0 {
		t.Fatalf("end %q not found", end)
	}
	return mustB64(t, rest[:i])
}

func mustB64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(strings.Join(strings.Fields(s), ""))
	if err != nil {
		t.Fatalf("base64url %q: %v", s, err)
	}
	return b
}

func eqBytes(t *testing.T, name string, got, want []byte) {
	t.Helper()
	if !bytes.Equal(got, want) {
		t.Errorf("%s:\n got  %x\n want %x", name, got, want)
	}
}

// T1. RFC 8291 Appendix A: every intermediate value, then the Section 5 body.
func TestRFC8291AppendixA(t *testing.T) {
	rfc := readRFC(t, "rfc8291.txt")
	appA := after(t, rfc, "Appendix A.")
	v := func(label string) []byte { return b64Block(t, appA, "("+label+"):") }

	as, err := ecdh.P256().NewPrivateKey(v("as_private"))
	if err != nil {
		t.Fatal(err)
	}
	eqBytes(t, "as_public", as.PublicKey().Bytes(), v("as_public"))
	ua, err := ecdh.P256().NewPublicKey(v("ua_public"))
	if err != nil {
		t.Fatal(err)
	}
	auth := v("auth_secret")
	salt := b64Block(t, appA, "Salt:")
	plaintext := b64Block(t, appA, "Plaintext:")
	if string(plaintext) != "When I grow up, I want to be a watermelon" {
		t.Fatalf("plaintext %q", plaintext)
	}

	k, err := derive(as, ua, auth, salt)
	if err != nil {
		t.Fatal(err)
	}
	eqBytes(t, "ecdh_secret", k.ecdhSecret, v("ecdh_secret"))
	eqBytes(t, "PRK_key", k.prkKey, v("PRK_key"))
	eqBytes(t, "key_info", k.keyInfo, v("key_info"))
	eqBytes(t, "IKM", k.ikm, v("IKM"))
	eqBytes(t, "PRK", k.prk, v("PRK"))
	eqBytes(t, "cek_info", []byte(cekInfo), v("cek_info"))
	eqBytes(t, "CEK", k.cek, v("CEK"))
	eqBytes(t, "nonce_info", []byte(nonceInfo), v("nonce_info"))
	eqBytes(t, "NONCE", k.nonce, v("NONCE"))

	body, err := encryptWith(plaintext, ua, auth, salt, as)
	if err != nil {
		t.Fatal(err)
	}
	eqBytes(t, "header", body[:HeaderLen], b64Block(t, appA, "header of:"))
	padded := append(append([]byte{}, plaintext...), 0x02)
	eqBytes(t, "padded plaintext", padded, b64Block(t, appA, "to produce:"))
	eqBytes(t, "ciphertext", body[HeaderLen:], b64Block(t, appA, "which emits ciphertext", "of:"))

	// Section 5: 144 octets. The RFC's "Content-Length: 145" is erratum 5230.
	want := b64Block(t, rfc, "Content-Encoding: aes128gcm")
	eqBytes(t, "section 5 body", body, want)
	if len(body) != 144 || len(body) != HeaderLen+len(plaintext)+17 {
		t.Errorf("body is %d octets, want 144", len(body))
	}
}

// T2. RFC 8188 §3.1, the content-coding layer alone (no Web Push key agreement).
func TestRFC8188Section31(t *testing.T) {
	rfc := readRFC(t, "rfc8188.txt")
	ikm := b64Until(t, rfc, `"`, `the value "`)
	body := b64Block(t, rfc, "Content-Encoding: aes128gcm")
	line := func(marker string) []byte { return b64Until(t, rfc, "\n", marker) }

	salt := body[:16]
	eqBytes(t, "salt", salt, line("salt (from header) = "))
	prk, cek, nonce, err := contentKeys(ikm, salt)
	if err != nil {
		t.Fatal(err)
	}
	eqBytes(t, "PRK", prk, line("PRK = "))
	eqBytes(t, "CEK", cek, line("CEK = "))
	eqBytes(t, "NONCE", nonce, line("NONCE = "))

	data := line("unencrypted data = ")
	if string(data) != "I am the walrus\x02" {
		t.Fatalf("unencrypted data %q", data)
	}
	got, err := seal(appendHeader(nil, salt, nil), cek, nonce, data[:len(data)-1])
	if err != nil {
		t.Fatal(err)
	}
	eqBytes(t, "body", got, body)
	// The text says 54 octets; it is 53 (erratum 5516).
	if len(got) != 53 {
		t.Errorf("body is %d octets, want 53", len(got))
	}
}

// decryptAsBrowser is the receiver's side of RFC 8291 §3.4, written apart from the package
// code so the round trip is not the encryption checking itself.
func decryptAsBrowser(body []byte, ua *ecdh.PrivateKey, auth []byte) ([]byte, error) {
	if len(body) < HeaderLen+17 {
		return nil, errors.New("short")
	}
	salt := body[:16]
	if binary.BigEndian.Uint32(body[16:20]) != 4096 || body[20] != 65 {
		return nil, errors.New("header")
	}
	asPub, err := ecdh.P256().NewPublicKey(body[21:86])
	if err != nil {
		return nil, err
	}
	secret, err := ua.ECDH(asPub)
	if err != nil {
		return nil, err
	}
	prkKey, _ := hkdf.Extract(sha256.New, secret, auth)
	info := append(append([]byte("WebPush: info\x00"), ua.PublicKey().Bytes()...), body[21:86]...)
	ikm, _ := hkdf.Expand(sha256.New, prkKey, string(info), 32)
	prk, _ := hkdf.Extract(sha256.New, ikm, salt)
	cek, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	padded, err := gcm.Open(nil, nonce, body[HeaderLen:], nil)
	if err != nil {
		return nil, err
	}
	if len(padded) == 0 || padded[len(padded)-1] != 0x02 {
		return nil, errors.New("no 0x02 delimiter")
	}
	return padded[:len(padded)-1], nil
}

type subscription struct {
	priv         *ecdh.PrivateKey
	p256dh, auth string
	authRaw      []byte
}

func newSubscription(t *testing.T) subscription {
	t.Helper()
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	rand.Read(auth)
	return subscription{priv: priv, authRaw: auth,
		p256dh: base64.RawURLEncoding.EncodeToString(priv.PublicKey().Bytes()),
		auth:   base64.RawURLEncoding.EncodeToString(auth)}
}

// T3. Round trip, and any changed byte fails to decrypt.
func TestRoundTrip(t *testing.T) {
	sub := newSubscription(t)
	plaintext := []byte(`{"v":1,"kind":"message","title":"Jordan Hayes \u00b7 Negril"}`)
	body, err := Encrypt(plaintext, sub.p256dh, sub.auth)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) != HeaderLen+len(plaintext)+17 {
		t.Errorf("body %d octets", len(body))
	}
	got, err := decryptAsBrowser(body, sub.priv, sub.authRaw)
	if err != nil || !bytes.Equal(got, plaintext) {
		t.Fatalf("round trip: %q %v", got, err)
	}
	// With `=` padding on the keys, as some browsers' toJSON has sent them.
	if _, err := Encrypt(plaintext, sub.p256dh+"=", sub.auth+"=="); err != nil {
		t.Errorf("padded keys: %v", err)
	}
	for _, i := range []int{0, 15, 30, 85, 86, len(body) / 2, len(body) - 1} {
		bad := append([]byte{}, body...)
		bad[i] ^= 0x01
		if _, err := decryptAsBrowser(bad, sub.priv, sub.authRaw); err == nil {
			t.Errorf("byte %d changed and it still decrypted", i)
		}
	}
	other := newSubscription(t)
	if _, err := decryptAsBrowser(body, sub.priv, other.authRaw); err == nil {
		t.Error("the wrong auth secret decrypted it")
	}
	// The largest message fills exactly one 4096-octet record.
	big := bytes.Repeat([]byte("x"), MaxPlaintext)
	body, err = Encrypt(big, sub.p256dh, sub.auth)
	if err != nil || len(body) != 4096 {
		t.Fatalf("max plaintext: %d %v", len(body), err)
	}
	if got, err := decryptAsBrowser(body, sub.priv, sub.authRaw); err != nil || !bytes.Equal(got, big) {
		t.Fatalf("max plaintext round trip: %v", err)
	}
}

func verifyJWT(t *testing.T, jwt string, k []byte) (header, claims []byte) {
	t.Helper()
	pub, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), k)
	if err != nil {
		t.Fatalf("k: %v", err)
	}
	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		t.Fatalf("jwt has %d parts", len(parts))
	}
	sig := mustB64(t, parts[2])
	if len(sig) != 64 {
		t.Fatalf("signature is %d octets", len(sig))
	}
	h := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(pub, h[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("signature does not verify")
	}
	return mustB64(t, parts[0]), mustB64(t, parts[1])
}

// T4. VAPID: the RFC 8292 example verifies, and ours matches its shape byte for byte.
func TestVAPIDRFC8292Example(t *testing.T) {
	rfc := readRFC(t, "rfc8292.txt")
	jwt := strings.Join(strings.Fields(after(t, rfc, "t=")[:strings.Index(after(t, rfc, "t="), ",")]), "")
	k := b64Until(t, rfc, "{ encrypted", "k=")
	header, claims := verifyJWT(t, jwt, k)
	// The RFC's header and claims are the very bytes this package writes for the same values.
	if string(header) != `{"typ":"JWT","alg":"ES256"}` {
		t.Errorf("header %s", header)
	}
	var c struct {
		Aud string `json:"aud"`
		Exp int64  `json:"exp"`
		Sub string `json:"sub"`
	}
	if err := json.Unmarshal(claims, &c); err != nil {
		t.Fatal(err)
	}
	v := &VAPID{subject: c.Sub}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v.key = key
	ours, err := v.token(c.Aud, c.Exp)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(ours, ".")
	if got := parts[0] + "." + parts[1]; got != jwt[:strings.LastIndex(jwt, ".")] {
		t.Errorf("signing input differs from the RFC's:\n got  %s\n want %s", got, jwt[:strings.LastIndex(jwt, ".")])
	}
}

func newVAPID(t *testing.T, subject string) (*VAPID, []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	priv, _ := key.Bytes()
	pub, _ := key.PublicKey.Bytes()
	v, err := NewVAPID(base64.RawURLEncoding.EncodeToString(pub), base64.RawURLEncoding.EncodeToString(priv), subject)
	if err != nil {
		t.Fatal(err)
	}
	return v, pub
}

func TestVAPIDAuthorization(t *testing.T) {
	const subject = "mailto:gyasi.messages@adventures.story-tail.com"
	v, pub := newVAPID(t, subject)
	now := time.Unix(1_800_000_000, 999_000_000)
	h, err := v.Authorization("https://FCM.googleapis.com/fcm/send/abc:def?x=1", now)
	if err != nil {
		t.Fatal(err)
	}
	t1, k, ok := strings.Cut(strings.TrimPrefix(h, "vapid t="), ", k=")
	if !strings.HasPrefix(h, "vapid t=") || !ok {
		t.Fatalf("header shape %q", h)
	}
	if k != base64.RawURLEncoding.EncodeToString(pub) {
		t.Errorf("k is not the 65-octet public key, unpadded")
	}
	header, claims := verifyJWT(t, t1, pub)
	if string(header) != `{"typ":"JWT","alg":"ES256"}` {
		t.Errorf("header %s", header)
	}
	// Never "mailto:mailto:" (webpush-go's bug): the subject is VAPID_SUBJECT byte for byte.
	want := `{"aud":"https://fcm.googleapis.com","exp":1800043200,"sub":"` + subject + `"}`
	if string(claims) != want {
		t.Errorf("claims\n got  %s\n want %s", claims, want)
	}
	if _, err := v.Authorization("http://fcm.googleapis.com/x", now); !errors.Is(err, ErrBadEndpoint) {
		t.Errorf("an http endpoint: %v", err)
	}
}

// Every one of many signatures is 64 octets and verifies: r and s are left-padded, which only
// shows on the roughly 1 in 128 signatures where one of them is short.
func TestVAPIDSignaturesArePadded(t *testing.T) {
	v, pub := newVAPID(t, "https://adventures.story-tail.com/contact")
	n := 10_000
	if testing.Short() {
		n = 500
	}
	pk, _ := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), pub)
	for i := 0; i < n; i++ {
		jwt, err := v.token("https://web.push.apple.com", 1)
		if err != nil {
			t.Fatal(err)
		}
		dot := strings.LastIndexByte(jwt, '.')
		sig, err := base64.RawURLEncoding.DecodeString(jwt[dot+1:])
		if err != nil || len(sig) != 64 {
			t.Fatalf("signature %d: %d octets %v", i, len(sig), err)
		}
		h := sha256.Sum256([]byte(jwt[:dot]))
		if !ecdsa.Verify(pk, h[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
			t.Fatalf("signature %d does not verify", i)
		}
	}
}

// T5. Refusals.
func TestRefusals(t *testing.T) {
	rfc := readRFC(t, "rfc8291.txt")
	uaPublic := b64Block(t, after(t, rfc, "Appendix A."), "(ua_public):")
	sub := newSubscription(t)
	enc := base64.RawURLEncoding.EncodeToString
	flipped := append([]byte{}, uaPublic...)
	flipped[64] ^= 0x01

	for name, p256dh := range map[string]string{
		"64 octets":       enc(uaPublic[:64]),
		"66 octets":       enc(append(append([]byte{}, uaPublic...), 0)),
		"all zeros":       enc(make([]byte, 65)),
		"off the curve":   enc(flipped),
		"compressed form": enc(append([]byte{0x02}, uaPublic[1:33]...)),
		"not base64url":   "BCVxsr7N+eNgVRqv/HtD0zTZsEc6",
		"empty":           "",
	} {
		if _, err := Encrypt([]byte("x"), p256dh, sub.auth); !errors.Is(err, ErrBadP256dh) {
			t.Errorf("p256dh %s: %v", name, err)
		}
	}
	for _, n := range []int{0, 15, 17, 32} {
		if _, err := Encrypt([]byte("x"), sub.p256dh, enc(make([]byte, n))); !errors.Is(err, ErrBadAuth) {
			t.Errorf("auth of %d octets: %v", n, err)
		}
	}
	if _, err := Encrypt(make([]byte, MaxPlaintext+1), sub.p256dh, sub.auth); !errors.Is(err, ErrTooLong) {
		t.Errorf("3994 octets: %v", err)
	}
	if MaxPlaintext != 3993 {
		t.Errorf("MaxPlaintext %d", MaxPlaintext)
	}

	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	privRaw, _ := key.Bytes()
	pubRaw, _ := key.PublicKey.Bytes()
	other, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	otherPub, _ := other.PublicKey.Bytes()
	order := elliptic.P256().Params().N.FillBytes(make([]byte, 32))
	const subject = "mailto:x@example.com"
	for _, c := range []struct {
		name               string
		pub, priv, subject string
		want               error
	}{
		{"zero private key", enc(pubRaw), enc(make([]byte, 32)), subject, ErrBadVAPIDPrivate},
		{"private key = the order", enc(pubRaw), enc(order), subject, ErrBadVAPIDPrivate},
		{"private key above the order", enc(pubRaw), enc(bytes.Repeat([]byte{0xff}, 32)), subject, ErrBadVAPIDPrivate},
		{"private key of 31 octets", enc(pubRaw), enc(privRaw[1:]), subject, ErrBadVAPIDPrivate},
		{"public key of 64 octets", enc(pubRaw[:64]), enc(privRaw), subject, ErrBadVAPIDPublic},
		{"public key not the private key's", enc(otherPub), enc(privRaw), subject, ErrVAPIDKeyMismatch},
		{"subject with no scheme", enc(pubRaw), enc(privRaw), "x@example.com", ErrBadSubject},
		{"http subject", enc(pubRaw), enc(privRaw), "http://example.com", ErrBadSubject},
		{"empty subject", enc(pubRaw), enc(privRaw), "", ErrBadSubject},
		{"mailto with nothing", enc(pubRaw), enc(privRaw), "mailto:", ErrBadSubject},
		{"mailto", enc(pubRaw), enc(privRaw), subject, nil},
		{"https", enc(pubRaw), enc(privRaw), "https://adventures.story-tail.com", nil},
		{"padded keys", enc(pubRaw) + "=", enc(privRaw) + "=", subject, nil},
	} {
		if _, err := NewVAPID(c.pub, c.priv, c.subject); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, want %v", c.name, err, c.want)
		}
	}
	// No error text quotes a key.
	for _, e := range []error{ErrTooLong, ErrBadP256dh, ErrBadAuth, ErrBadVAPIDPrivate, ErrBadVAPIDPublic,
		ErrVAPIDKeyMismatch, ErrBadSubject, ErrBadEndpoint} {
		if strings.Contains(e.Error(), sub.p256dh) || strings.Contains(e.Error(), enc(privRaw)) {
			t.Errorf("%v quotes a key", e)
		}
	}
}

// T6. Every encryption draws its own key pair and salt.
func TestFreshKeysAndSalt(t *testing.T) {
	sub := newSubscription(t)
	a, err := Encrypt([]byte("same"), sub.p256dh, sub.auth)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := Encrypt([]byte("same"), sub.p256dh, sub.auth)
	if bytes.Equal(a[:16], b[:16]) {
		t.Error("salt reused")
	}
	if bytes.Equal(a[21:86], b[21:86]) {
		t.Error("as_public reused")
	}
	if bytes.Equal(a[86:], b[86:]) {
		t.Error("ciphertext repeated")
	}
}

// T7. One payload slice with spare room, sent to many devices at once through push.Deliver,
// is never written (run with -race).
func TestSharedPayloadIsNeverWritten(t *testing.T) {
	plaintext := make([]byte, 0, 512)
	plaintext = append(plaintext, `{"v":1,"kind":"summary","tag":"summary","count":3}`...)
	before := append([]byte{}, plaintext...)
	subs := make([]subscription, 16)
	devices := make([]push.Device, len(subs))
	for i := range subs {
		subs[i] = newSubscription(t)
		devices[i] = push.Device{DeviceID: string(rune('a' + i)), Platform: "web"}
	}
	var mu sync.Mutex
	bodies := map[string][]byte{}
	result := push.Deliver(devices, push.Summary{}, func(d push.Device, _ push.Payload) (push.DeviceOutcome, error) {
		s := subs[d.DeviceID[0]-'a']
		body, err := Encrypt(plaintext, s.p256dh, s.auth)
		if err != nil {
			return push.OutcomeError, err
		}
		mu.Lock()
		bodies[d.DeviceID] = body
		mu.Unlock()
		return push.OutcomeOK, nil
	})
	if !result.OK {
		t.Fatal("a send failed")
	}
	if !bytes.Equal(plaintext, before) || !bytes.Equal(plaintext[:cap(plaintext)][len(before):len(before)+1], []byte{0}) {
		t.Error("the shared payload slice was written")
	}
	for id, body := range bodies {
		s := subs[id[0]-'a']
		if got, err := decryptAsBrowser(body, s.priv, s.authRaw); err != nil || !bytes.Equal(got, before) {
			t.Errorf("device %s: %v", id, err)
		}
	}
}
