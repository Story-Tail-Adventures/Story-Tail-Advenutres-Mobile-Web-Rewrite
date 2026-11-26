// Package fcm ports the pure parts of supabase/functions/_shared/fcm.ts: sending to an Android
// phone through Firebase Cloud Messaging's HTTP v1 API, with no Firebase SDK on the server
// (docs/Push-Notifications-Security-Review.md §3). A service-account key signs a short-lived
// JWT (RS256), Google trades it for an access token, and one POST per device sends the message.
//
// ── WHAT GOOGLE CAN READ ────────────────────────────────────────────────────
//
// An FCM payload is NOT end-to-end encrypted, so it carries no words: the kind, the thread id, a
// count and the `seenUpTo` timestamp (§3.1 b, "fetch on receipt"). The app reads the client's
// name, the trip and the first line from our own API over its own session, and builds the
// notification itself. AndroidData is the only thing that decides what goes to Google, and its
// test pins that no name or message text can reach it.
//
// It is a DATA message (no `notification` block), sent at high priority, so the app's messaging
// service runs even in the background and draws the notification its own way: the locked-screen
// rule, Reply and Mark read.
//
// Secret: FCM_SERVICE_ACCOUNT_JSON, the key file Firebase hands out. It can send to our app and
// nothing else.
//
// Not ported here (needs the environment / network; ported with its function):
//   - serviceAccountFromEnv: reads FCM_SERVICE_ACCOUNT_JSON from Deno.env (unusable JSON, or a
//     key missing project_id, client_email or private_key, logs "push: FCM_SERVICE_ACCOUNT_JSON
//     is set but is not a usable service-account key" and answers null).
//   - accessToken / exchange: POST the SignedAssertion to TOKEN_URL (grant_type
//     urn:ietf:params:oauth:grant-type:jwt-bearer, 10 s timeout), and cache the access token
//     (the in-flight PROMISE, so a pass signs once) for 50 minutes; a failed exchange is not
//     cached.
//   - fcmSender: POST FCMMessage to
//     https://fcm.googleapis.com/v1/projects/{encodeURIComponent(project_id)}/messages:send;
//     "skipped" for a non-Android device, "gone" for one without a token; on a non-2xx read the
//     first error.details[].errorCode, log status and code only, forget the cached token on a
//     401; answer FCMOutcome(status, code).
package fcm

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"regexp"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// Scope is what the access token may do.
const Scope = "https://www.googleapis.com/auth/firebase.messaging"

// TokenURL is Google's token endpoint, the assertion's audience.
const TokenURL = "https://oauth2.googleapis.com/token"

// ttlSeconds is how long FCM keeps an undelivered message. A day-old "new message" is noise.
const ttlSeconds = 12 * 3600

// ServiceAccount is the parts of the Firebase key file that are used.
type ServiceAccount struct {
	ProjectID   string `json:"project_id"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
}

// AndroidData is what an Android device is sent: strings only (FCM data values must be
// strings), and nothing a reader at Google could learn a client from. The summary carries its
// count; the app names the clients from its own inbox read. Keys in the order Deno wrote them.
func AndroidData(payload push.Payload) js.Ordered {
	switch p := payload.(type) {
	case push.Message:
		return js.O(
			"v", "1",
			"kind", "message",
			"tag", p.Tag,
			"conversationId", p.ConversationID,
			"seenUpTo", p.SeenUpTo,
			"count", strconv.Itoa(p.Count),
		)
	case push.Summary:
		return js.O("v", "1", "kind", "summary", "tag", p.Tag, "count", strconv.Itoa(p.Count))
	case push.Dismiss:
		d := js.O("v", "1", "kind", "dismiss", "tag", p.Tag)
		if p.ReadUpTo != nil && *p.ReadUpTo != "" {
			d = append(d, js.Field{Key: "readUpTo", Value: *p.ReadUpTo})
		}
		return d
	// §3.12.3. Ids only, like a message: the phone reads the name over its own session.
	case push.QuoteRequest:
		return js.O("v", "1", "kind", "quote_request", "tag", p.Tag, "tripId", p.TripID)
	// §3.8 (2026-10-21). The lead id only; the phone reads the name over its own session. A
	// phone build from before the lead kind existed shows nothing for it (AgentPushData.parse).
	case push.LeadMessage:
		return js.O("v", "1", "kind", "lead_message", "tag", p.Tag, "leadId", p.LeadID)
	}
	panic("fcm: not a push payload") // unreachable: push.Payload is sealed
}

// Envelope is the FCM v1 request body.
type Envelope struct {
	Message Message `json:"message"`
}

// Message is the FCM v1 message for one device. It has no notification block, on purpose.
type Message struct {
	Token   string     `json:"token"`
	Data    js.Ordered `json:"data"`
	Android Android    `json:"android"`
}

// Android is the message's Android options.
type Android struct {
	Priority string `json:"priority"`
	TTL      string `json:"ttl"`
	// CollapseKey keeps one waiting message per thread.
	CollapseKey string `json:"collapse_key"`
}

// FCMMessage is the FCM v1 message for one device. Marshal it with js.Marshal.
func FCMMessage(token string, payload push.Payload) Envelope {
	return Envelope{Message: Message{
		Token: token,
		Data:  AndroidData(payload),
		Android: Android{
			Priority:    "HIGH",
			TTL:         strconv.Itoa(ttlSeconds) + "s",
			CollapseKey: js.Slice(payload.PayloadTag(), 0, 64),
		},
	}}
}

// FCMOutcome is FCM's answer as a DeviceOutcome; errorCode "" is null. ONLY the UNREGISTERED
// error code means the token is dead. A bare 404 is not enough: FCM answers 404 for a wrong
// project too, and treating that as "gone" would make one misconfigured key delete every
// advisor's phone. A 400 is our own request.
func FCMOutcome(status int, errorCode string) push.DeviceOutcome {
	if status >= 200 && status < 300 {
		return push.OutcomeOK
	}
	if errorCode == "UNREGISTERED" {
		return push.OutcomeGone
	}
	return push.OutcomeError
}

var pemMarkers = regexp.MustCompile(`-----(BEGIN|END) PRIVATE KEY-----`)

// pemToPKCS8 reads the key file's PEM as Deno did: the markers and every whitespace character
// dropped, the rest decoded as atob would (forgiving about missing padding).
func pemToPKCS8(pem string) (*rsa.PrivateKey, error) {
	body := strings.Map(func(r rune) rune {
		if js.IsSpace(r) {
			return -1
		}
		return r
	}, pemMarkers.ReplaceAllLiteralString(pem, ""))
	if len(body)%4 == 0 {
		body = strings.TrimSuffix(body, "=")
		body = strings.TrimSuffix(body, "=")
	}
	if len(body)%4 == 1 {
		return nil, errors.New("fcm: the private key is not base64")
	}
	der, err := base64.RawStdEncoding.DecodeString(body)
	if err != nil {
		return nil, errors.New("fcm: the private key is not base64")
	}
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("fcm: the private key is not an RSA key")
	}
	return rsaKey, nil
}

// SignedAssertion is the signed assertion Google's token endpoint takes (RFC 7523): an RS256
// JWT for Scope, valid for an hour from nowSeconds.
func SignedAssertion(sa ServiceAccount, nowSeconds int64) (string, error) {
	enc := base64.RawURLEncoding
	headerJSON, err := js.Marshal(js.O("alg", "RS256", "typ", "JWT"))
	if err != nil {
		return "", err
	}
	claimsJSON, err := js.Marshal(js.O(
		"iss", sa.ClientEmail,
		"scope", Scope,
		"aud", TokenURL,
		"iat", nowSeconds,
		"exp", nowSeconds+3600,
	))
	if err != nil {
		return "", err
	}
	signingInput := enc.EncodeToString(headerJSON) + "." + enc.EncodeToString(claimsJSON)
	key, err := pemToPKCS8(sa.PrivateKey)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return signingInput + "." + enc.EncodeToString(sig), nil
}
