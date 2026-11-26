package fcm

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// Ported from _shared/fcm_test.ts, one Go test per Deno.test. agentalerts_test.go holds the
// one agentAlerts_test.ts case that checks androidData.

const conv = "0195a2c0-1a00-7000-8000-0000000000b0"

func str(s string) *string { return &s }

var row = push.ClaimedRow{
	OutboxID:        "o1",
	AgentID:         "a1",
	Kind:            push.KindMessage,
	ConversationID:  str(conv),
	MessageCount:    2,
	ClientName:      str("Jordan Hayes"),
	TripTitle:       str("Anniversary Week in Negril"),
	Preview:         str("Is the airport transfer included?"),
	LatestCreatedAt: "2026-10-15T14:02:11.123456+00:00",
}

func eq[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

// Deno: "an Android payload carries no name, trip or message text (Google can read it)"
func TestAndroidPayloadCarriesNoNameTripOrText(t *testing.T) {
	maya := row
	maya.ClientName = str("Maya Carter")
	payloads := []push.Payload{
		push.MessagePayload(row),
		push.SummaryPayload([]push.ClaimedRow{row, maya}, time.Date(2026, 10, 15, 15, 0, 0, 0, time.UTC)),
		push.DismissPayload(conv, str("2026-10-15T14:02:11.123456+00:00")),
	}
	for _, p := range payloads {
		wire, err := js.Marshal(FCMMessage("token-123", p))
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range []string{"Jordan", "Hayes", "Maya", "Negril", "airport", "rested"} {
			if strings.Contains(string(wire), secret) {
				t.Errorf("%s leaked %q", p.PayloadKind(), secret)
			}
		}
	}
	eq(t, AndroidData(push.MessagePayload(row)), js.O(
		"v", "1",
		"kind", "message",
		"tag", conv,
		"conversationId", conv,
		"seenUpTo", "2026-10-15T14:02:11.123456+00:00",
		"count", "2",
	))
	eq(t, AndroidData(payloads[1]), js.O("v", "1", "kind", "summary", "tag", "summary", "count", "4"))
	eq(t, AndroidData(payloads[2]), js.O(
		"v", "1",
		"kind", "dismiss",
		"tag", conv,
		"readUpTo", "2026-10-15T14:02:11.123456+00:00",
	))
}

// Deno: "a data message at high priority, one waiting per thread"
func TestDataMessageHighPriorityOnePerThread(t *testing.T) {
	m := FCMMessage("tok", push.MessagePayload(row)).Message
	eq(t, m.Token, "tok")
	eq(t, m.Android.Priority, "HIGH")
	eq(t, m.Android.CollapseKey, conv)
	wire, err := js.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(wire), `"notification"`) {
		t.Error("a notification block would let the system draw it, not the app")
	}
}

// Deno: "only a dead token is forgotten; our own bad request never is"
func TestOnlyDeadTokenIsForgotten(t *testing.T) {
	eq(t, FCMOutcome(200, ""), push.OutcomeOK)
	eq(t, FCMOutcome(404, "UNREGISTERED"), push.OutcomeGone)
	// A bare 404 is also what a wrong project gets: never a reason to delete every phone.
	eq(t, FCMOutcome(404, ""), push.OutcomeError)
	eq(t, FCMOutcome(400, "INVALID_ARGUMENT"), push.OutcomeError)
	eq(t, FCMOutcome(401, ""), push.OutcomeError)
	eq(t, FCMOutcome(503, "UNAVAILABLE"), push.OutcomeError)
}

// Deno: "the service-account assertion is a verifiable RS256 JWT for FCM"
func TestServiceAccountAssertionIsVerifiableRS256JWT(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	pkcs8, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	// `btoa(b).replace(/.{64}/g, "$&\n")`: a line break after every 64 characters.
	b64 := base64.StdEncoding.EncodeToString(pkcs8)
	var lines strings.Builder
	for i := 0; i+64 <= len(b64); i += 64 {
		lines.WriteString(b64[i:i+64] + "\n")
	}
	lines.WriteString(b64[len(b64)-len(b64)%64:])
	pemText := "-----BEGIN PRIVATE KEY-----\n" + lines.String() + "\n-----END PRIVATE KEY-----\n"

	jwt, err := SignedAssertion(ServiceAccount{ProjectID: "p", ClientEmail: "svc@p.iam.gserviceaccount.com", PrivateKey: pemText}, 1_000)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(jwt, ".")
	if len(parts) != 3 {
		t.Fatalf("got %d parts", len(parts))
	}
	dec := func(s string) []byte {
		b, err := base64.RawURLEncoding.DecodeString(s)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	// Byte for byte what JSON.stringify wrote, which is stricter than the Deno test's
	// parse-and-compare.
	eq(t, string(dec(parts[0])), `{"alg":"RS256","typ":"JWT"}`)
	eq(t, string(dec(parts[1])), `{"iss":"svc@p.iam.gserviceaccount.com","scope":"https://www.googleapis.com/auth/firebase.messaging","aud":"https://oauth2.googleapis.com/token","iat":1000,"exp":4600}`)
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], dec(parts[2])); err != nil {
		t.Errorf("signature does not verify: %v", err)
	}
}
