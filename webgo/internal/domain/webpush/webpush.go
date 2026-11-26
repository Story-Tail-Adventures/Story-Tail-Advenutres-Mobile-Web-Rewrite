// Package webpush encrypts a Web Push message (RFC 8291, the aes128gcm content coding of
// RFC 8188) and signs its VAPID header (RFC 8292), on the standard library alone. It replaces
// web-push 3.6.7 in `push-dispatch` (docs/WebPush-Go-Library-Security-Review.md §4 and §5, the
// build rules this file follows step by step).
//
// We write no cryptography here: the curve, ECDH, HKDF, AES-GCM, ECDSA and the random numbers
// are all Go's own crypto packages. This is the glue, and the RFCs publish every intermediate
// value for fixed inputs, so webpush_test.go pins it byte for byte (T1 to T7).
//
// Pure: no network and no environment. The keys are passed in; only the push-dispatch port
// reads the VAPID_* secrets and posts the request.
//
// Two bugs in webpush-go v1.4.0 that this must never copy (the review's §3): it wrote the
// padding into the CALLER's payload slice (a data race when one payload goes to several
// devices at once), and it put "mailto:" in front of a subject that already had it, which Apple
// refuses. Here the plaintext is copied before the delimiter is added, and the subject is used
// exactly as set.
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
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

const (
	// RecordSize is the one record's size, as web-push sent it (rs 4096).
	RecordSize = 4096
	// HeaderLen is salt (16) + rs (4) + idlen (1) + as_public (65).
	HeaderLen = 86
	// MaxPlaintext is the largest message one record can carry (RFC 8291 §4): 4096 less the
	// header, the 0x02 delimiter and the 16-octet tag.
	MaxPlaintext = RecordSize - HeaderLen - 1 - 16
	// TokenSeconds is how long a VAPID token lives: 12 hours, web-push's default.
	TokenSeconds = 12 * 3600
)

// The HKDF info strings (RFC 8291 §3.4, RFC 8188 §2.2 and §2.3).
const (
	keyInfoPrefix = "WebPush: info\x00"
	cekInfo       = "Content-Encoding: aes128gcm\x00"
	nonceInfo     = "Content-Encoding: nonce\x00"
)

// The errors. None quotes a key, an endpoint or the payload, so a log line built from one
// carries nothing secret.
var (
	ErrTooLong          = errors.New("webpush: the message is over 3993 octets")
	ErrBadP256dh        = errors.New("webpush: the subscription p256dh is not a P-256 public key")
	ErrBadAuth          = errors.New("webpush: the subscription auth secret is not 16 octets")
	ErrBadVAPIDPrivate  = errors.New("webpush: VAPID_PRIVATE_KEY is not a P-256 private key")
	ErrBadVAPIDPublic   = errors.New("webpush: VAPID_PUBLIC_KEY is not a P-256 public key")
	ErrVAPIDKeyMismatch = errors.New("webpush: VAPID_PUBLIC_KEY is not the public half of VAPID_PRIVATE_KEY")
	ErrBadSubject       = errors.New("webpush: VAPID_SUBJECT must be a mailto: or https: URL")
	ErrBadEndpoint      = errors.New("webpush: the endpoint is not an https URL")
)

// decode reads base64url with or without its `=` padding, as the Push API and web-push both
// accept it.
func decode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// Encrypt encrypts one message to one browser subscription: a new P-256 key pair and a new
// 16-octet salt for every call, never reused across messages or devices, never stored. The
// body is the 86-octet header followed by one record: 86 + len(plaintext) + 17 octets.
// plaintext is read, never written.
func Encrypt(plaintext []byte, p256dh, auth string) ([]byte, error) {
	if len(plaintext) > MaxPlaintext {
		return nil, ErrTooLong
	}
	ua, err := userAgentKey(p256dh)
	if err != nil {
		return nil, err
	}
	secret, err := authSecret(auth)
	if err != nil {
		return nil, err
	}
	as, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return encryptWith(plaintext, ua, secret, salt, as)
}

// userAgentKey loads p256dh. ecdh refuses a wrong length, the point at infinity and any point
// off the curve, as RFC 8291 §3.1 requires.
func userAgentKey(p256dh string) (*ecdh.PublicKey, error) {
	raw, err := decode(p256dh)
	if err != nil {
		return nil, ErrBadP256dh
	}
	k, err := ecdh.P256().NewPublicKey(raw)
	if err != nil {
		return nil, ErrBadP256dh
	}
	return k, nil
}

// authSecret is the subscription's 16-octet auth secret (web-push took 16 or more; browsers
// send exactly 16).
func authSecret(auth string) ([]byte, error) {
	raw, err := decode(auth)
	if err != nil || len(raw) != 16 {
		return nil, ErrBadAuth
	}
	return raw, nil
}

// keys are the derived values of RFC 8291 §3.4 and RFC 8188 §2, kept apart so the RFC test
// can check each one.
type keys struct {
	ecdhSecret, prkKey, keyInfo, ikm, prk, cek, nonce []byte
}

// derive is RFC 8291 §3.4 (the IKM from the ECDH secret and the auth secret) followed by
// RFC 8188's content keys, SHA-256 throughout.
func derive(as *ecdh.PrivateKey, ua *ecdh.PublicKey, auth, salt []byte) (keys, error) {
	var k keys
	var err error
	if k.ecdhSecret, err = as.ECDH(ua); err != nil { // always 32 octets
		return k, err
	}
	if k.prkKey, err = hkdf.Extract(sha256.New, k.ecdhSecret, auth); err != nil {
		return k, err
	}
	k.keyInfo = make([]byte, 0, len(keyInfoPrefix)+2*65)
	k.keyInfo = append(k.keyInfo, keyInfoPrefix...)
	k.keyInfo = append(k.keyInfo, ua.Bytes()...)
	k.keyInfo = append(k.keyInfo, as.PublicKey().Bytes()...)
	if k.ikm, err = hkdf.Expand(sha256.New, k.prkKey, string(k.keyInfo), 32); err != nil {
		return k, err
	}
	k.prk, k.cek, k.nonce, err = contentKeys(k.ikm, salt)
	return k, err
}

// contentKeys is RFC 8188 §2.2 and §2.3: PRK = HKDF-Extract(salt, IKM), then the 16-octet
// content encryption key and the 12-octet nonce. One record, sequence number 0, so the nonce
// is used as derived (no XOR).
func contentKeys(ikm, salt []byte) (prk, cek, nonce []byte, err error) {
	if prk, err = hkdf.Extract(sha256.New, ikm, salt); err != nil {
		return nil, nil, nil, err
	}
	if cek, err = hkdf.Expand(sha256.New, prk, cekInfo, 16); err != nil {
		return nil, nil, nil, err
	}
	if nonce, err = hkdf.Expand(sha256.New, prk, nonceInfo, 12); err != nil {
		return nil, nil, nil, err
	}
	return prk, cek, nonce, nil
}

// appendHeader is RFC 8188 §2.1: salt (16) || rs as a big-endian uint32 (4) || idlen (1) ||
// keyid. Web Push's keyid is as_public (65), so its header is 86 octets.
func appendHeader(dst, salt, keyID []byte) []byte {
	dst = append(dst, salt...)
	dst = binary.BigEndian.AppendUint32(dst, RecordSize)
	dst = append(dst, byte(len(keyID)))
	return append(dst, keyID...)
}

// seal appends the one record: a fresh copy of the plaintext, the 0x02 delimiter and no
// further padding, sealed with AES-128-GCM and no additional data. The caller's slice is only
// read (never appended to: webpush-go's race).
func seal(dst, cek, nonce, plaintext []byte) ([]byte, error) {
	padded := make([]byte, len(plaintext)+1)
	copy(padded, plaintext)
	padded[len(plaintext)] = 0x02
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Seal(dst, nonce, padded, nil), nil
}

// encryptWith is Encrypt with the key pair and salt injected. Only the RFC test calls it with
// fixed ones.
func encryptWith(plaintext []byte, ua *ecdh.PublicKey, auth, salt []byte, as *ecdh.PrivateKey) ([]byte, error) {
	if len(plaintext) > MaxPlaintext {
		return nil, ErrTooLong
	}
	k, err := derive(as, ua, auth, salt)
	if err != nil {
		return nil, err
	}
	out := appendHeader(make([]byte, 0, HeaderLen+len(plaintext)+1+16), salt, as.PublicKey().Bytes())
	return seal(out, k.cek, k.nonce, plaintext)
}

// VAPID signs the Authorization header (RFC 8292). Build it once per run with NewVAPID; it is
// safe for concurrent use.
type VAPID struct {
	key       *ecdsa.PrivateKey
	publicKey string // base64url of the 65-octet point, no padding
	subject   string
}

// NewVAPID checks the three VAPID_* values. The private key must be a valid P-256 scalar
// (not zero, below the curve order), and the public key must be its public half: browsers
// subscribed with that key, so a mismatch would be refused by every push service on every
// send. The subject is used exactly as set, never prefixed.
func NewVAPID(publicKey, privateKey, subject string) (*VAPID, error) {
	raw, err := decode(privateKey)
	if err != nil || len(raw) != 32 {
		return nil, ErrBadVAPIDPrivate
	}
	key, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), raw)
	if err != nil {
		return nil, ErrBadVAPIDPrivate
	}
	derived, err := key.PublicKey.Bytes()
	if err != nil {
		return nil, ErrBadVAPIDPrivate
	}
	pub, err := decode(publicKey)
	if err != nil || len(pub) != 65 {
		return nil, ErrBadVAPIDPublic
	}
	if !bytes.Equal(pub, derived) {
		return nil, ErrVAPIDKeyMismatch
	}
	if !validSubject(subject) {
		return nil, ErrBadSubject
	}
	return &VAPID{key: key, publicKey: base64.RawURLEncoding.EncodeToString(derived), subject: subject}, nil
}

// validSubject is web-push's check: a URL whose scheme is mailto: or https:.
func validSubject(s string) bool {
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "mailto":
		return u.Opaque != ""
	case "https":
		return u.Host != ""
	}
	return false
}

// Authorization is the header for one request to endpoint:
// `vapid t=<ES256 JWT>, k=<public key>`. The token's audience is the endpoint's origin, it
// expires 12 hours from now (whole seconds), and its subject is VAPID_SUBJECT byte for byte.
func (v *VAPID) Authorization(endpoint string, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
		return "", ErrBadEndpoint
	}
	// web-push read the origin with Node's url.parse, which lower-cases the host.
	aud := "https://" + strings.ToLower(u.Host)
	jwt, err := v.token(aud, now.Unix()+TokenSeconds)
	if err != nil {
		return "", err
	}
	return "vapid t=" + jwt + ", k=" + v.publicKey, nil
}

// token is the JWT: header {"typ":"JWT","alg":"ES256"}, claims aud, exp, sub in that order
// (web-push's object literals), signed as JWS wants it: raw r || s, each left-padded to 32
// octets. Never SignASN1.
func (v *VAPID) token(aud string, exp int64) (string, error) {
	enc := base64.RawURLEncoding
	claims, err := js.Marshal(js.O("aud", aud, "exp", exp, "sub", v.subject))
	if err != nil {
		return "", err
	}
	signing := enc.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`)) + "." + enc.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, v.key, digest[:])
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return signing + "." + enc.EncodeToString(sig), nil
}
