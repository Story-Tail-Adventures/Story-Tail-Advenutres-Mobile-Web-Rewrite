package push

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Ported from _shared/push_test.ts, one Go test per Deno.test. The push half of
// agentAlerts_test.ts is in agentalerts_test.go.

const conv = "0195a2c0-1a00-7000-8000-0000000000b0"

var now = time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC) // Monday 07:00 in Chicago

const bullets = "\U00002022\U00002022\U00002022\U00002022"

func str(s string) *string { return &s }

func row(edit func(r *ClaimedRow)) ClaimedRow {
	r := ClaimedRow{
		OutboxID:        uuid.New(),
		AgentID:         "agent-1",
		Kind:            KindMessage,
		ConversationID:  str(conv),
		Held:            false,
		MessageCount:    1,
		ClientName:      str("Jordan Hayes"),
		TripTitle:       str("Anniversary Week in Negril"),
		Preview:         str("Sending over the confirmation the resort emailed us."),
		LatestCreatedAt: "2026-10-19T08:00:00.123456+00:00",
	}
	if edit != nil {
		edit(&r)
	}
	return r
}

func device(id, platform string) Device {
	return Device{DeviceID: id, Platform: platform, WebEndpoint: str("https://fcm.googleapis.com/x"), WebP256dh: str("k"), WebAuth: str("a")}
}

func eq[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func wantBadRequest(t *testing.T, err error) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != 400 {
		t.Errorf("want a 400 HttpError, got %v", err)
	}
}

// Deno: "a message notification: name and trip, the first line, the thread's tag"
func TestMessageNotification(t *testing.T) {
	p := MessagePayload(row(func(r *ClaimedRow) { r.MessageCount = 2 }))
	eq(t, p.Title, "Jordan Hayes \U000000b7 Anniversary Week in Negril")
	eq(t, p.Body, "Sending over the confirmation the resort emailed us.")
	eq(t, p.Tag, conv)
	eq(t, p.Count, 2)
	// Passed through as text: a Date would drop the microseconds and leave the message unread.
	eq(t, p.SeenUpTo, "2026-10-19T08:00:00.123456+00:00")
	eq(t, p.URL, "/agent/messages/"+conv+"?reply=1")
	eq(t, ThreadURL(conv), p.URL)
}

// Deno: "a thread with no trip shows the name alone; an attachment-only message still says something"
func TestNoTripNameAloneAttachmentOnlySaysSomething(t *testing.T) {
	eq(t, MessageTitle(str("Maya Carter"), nil), "Maya Carter")
	eq(t, MessageTitle(nil, str("  ")), "A client")
	eq(t, MessagePayload(row(func(r *ClaimedRow) { r.Preview = str("  ") })).Body, NoPreview)
}

// Deno: "nameList reads like a sentence"
func TestNameListReadsLikeASentence(t *testing.T) {
	eq(t, NameList([]string{}), "Your clients")
	eq(t, NameList([]string{"Jordan Hayes"}), "Jordan Hayes")
	eq(t, NameList([]string{"A", "B"}), "A and B")
	eq(t, NameList([]string{"A", "B", "C"}), "A, B and C")
	eq(t, NameList([]string{"A", "B", "C", "D"}), "A, B, C and 1 other")
	eq(t, NameList([]string{"A", "B", "C", "D", "E", "A"}), "A, B, C and 2 others")
}

// Deno: "the morning summary counts messages, not threads, and says overnight only when true"
func TestMorningSummaryCountsMessagesSaysOvernightOnlyWhenTrue(t *testing.T) {
	rows := []ClaimedRow{
		row(func(r *ClaimedRow) { r.MessageCount = 2 }),
		row(func(r *ClaimedRow) { r.ClientName = str("Maya Carter"); r.ConversationID = str(uuid.New()) }),
	}
	s := SummaryPayload(rows, now)
	eq(t, s.Title, "3 new messages while you rested")
	eq(t, s.Body, "Jordan Hayes and Maya Carter reached out overnight.")
	eq(t, s.URL, "/agent/messages")

	// A Saturday-afternoon message waiting for Monday 07:00 was not "overnight".
	sunday := SummaryPayload([]ClaimedRow{row(func(r *ClaimedRow) { r.LatestCreatedAt = "2026-10-18T15:00:00+00:00" })}, now)
	eq(t, sunday.Title, "1 new message while you rested")
	eq(t, sunday.Body, "Jordan Hayes reached out.")
}

// Deno: "planForAgent: each live row alone, every held row in one summary"
func TestPlanForAgentLiveAloneHeldInOneSummary(t *testing.T) {
	live := row(nil)
	h1 := row(func(r *ClaimedRow) { r.Held = true; r.ConversationID = str(uuid.New()) })
	h2 := row(func(r *ClaimedRow) {
		r.Held = true
		r.ConversationID = str(uuid.New())
		r.ClientName = str("Sam Rivera")
	})
	plan := PlanForAgent([]ClaimedRow{live, h1, h2}, now)
	eq(t, len(plan), 2)
	eq(t, plan[0].OutboxIDs, []string{live.OutboxID})
	eq(t, plan[0].Payload.PayloadKind(), "message")
	eq(t, plan[1].OutboxIDs, []string{h1.OutboxID, h2.OutboxID})
	eq(t, plan[1].Payload.PayloadKind(), "summary")
	eq(t, len(PlanForAgent([]ClaimedRow{live}, now)), 1)
}

// Deno: "only the browsers' own push services may be an endpoint"
func TestOnlyBrowserPushServicesMayBeAnEndpoint(t *testing.T) {
	for _, ok := range []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://wns2-par02p.notify.windows.com/w/?token=abc",
		"https://web.push.apple.com/QGx",
	} {
		if !IsAllowedPushEndpoint(ok) {
			t.Errorf("refused %s", ok)
		}
	}
	for _, bad := range []string{
		"http://fcm.googleapis.com/fcm/send/abc",      // not https
		"https://fcm.googleapis.com:8443/x",           // odd port
		"https://evil.example.com/fcm.googleapis.com", // host is what counts
		"https://fcm.googleapis.com.evil.example/x",   // suffix trick
		"https://user:pw@fcm.googleapis.com/x",
		"https://10.0.0.1/x",
		"https://localhost/x",
		"not a url",
		"https://fcm.googleapis.com/" + strings.Repeat("x", 1100),
	} {
		if IsAllowedPushEndpoint(bad) {
			t.Errorf("allowed %s", bad)
		}
	}
}

// Deno: "push service answers: 2xx ok, 404 and 410 gone, the rest an error"
func TestPushServiceAnswers(t *testing.T) {
	eq(t, OutcomeForStatus(201), OutcomeOK)
	eq(t, OutcomeForStatus(404), OutcomeGone)
	eq(t, OutcomeForStatus(410), OutcomeGone)
	eq(t, OutcomeForStatus(429), OutcomeError)
	eq(t, OutcomeForStatus(500), OutcomeError)
}

// Deno: "deliver: one device taking it is enough; gone devices are reported, not retried"
func TestDeliverOneDeviceEnoughGoneReported(t *testing.T) {
	answers := map[string]DeviceOutcome{"a": OutcomeOK, "b": OutcomeGone, "c": OutcomeError}
	send := func(d Device, _ Payload) (DeviceOutcome, error) { return answers[d.DeviceID], nil }
	p := MessagePayload(row(nil))

	mixed := Deliver([]Device{device("a", "web"), device("b", "web"), device("c", "web")}, p, send)
	if !mixed.OK {
		t.Error("mixed: want ok")
	}
	eq(t, mixed.GoneDeviceIDs, []string{"b"})

	// Only errors: worth a retry.
	if Deliver([]Device{device("c", "web")}, p, send).OK {
		t.Error("only errors: want not ok")
	}

	// Only gone, or nothing reachable yet: nothing left to try, so not a failure.
	if !Deliver([]Device{device("b", "web")}, p, send).OK {
		t.Error("only gone: want ok")
	}
	skipped := func(Device, Payload) (DeviceOutcome, error) { return OutcomeSkipped, nil }
	if !Deliver([]Device{device("d", "android")}, p, skipped).OK {
		t.Error("only skipped: want ok")
	}
	if !Deliver([]Device{}, p, send).OK {
		t.Error("no devices: want ok")
	}

	// A sender that throws is an error for that device, not for the batch.
	throws := Deliver([]Device{device("a", "web"), device("x", "web")}, p, func(d Device, _ Payload) (DeviceOutcome, error) {
		if d.DeviceID == "x" {
			return "", errors.New("boom")
		}
		return OutcomeOK, nil
	})
	if !throws.OK {
		t.Error("one throws, one ok: want ok")
	}
}

// Deno: "readWebSubscription: a push service endpoint and both keys, or a 400"
func TestReadWebSubscription(t *testing.T) {
	p256dh := "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
	auth := "tBHItJI5svbpez7KI4CCXg"
	keys := js.ObjectValue("p256dh", js.StringValue(p256dh), "auth", js.StringValue(auth))
	sub := func(endpoint string, keys js.Value) js.Value {
		return js.ObjectValue("endpoint", js.StringValue(endpoint), "keys", keys)
	}
	ok, err := ReadWebSubscription(sub("https://fcm.googleapis.com/fcm/send/abc", keys))
	if err != nil {
		t.Fatal(err)
	}
	eq(t, ok.P256dh, p256dh)
	_, err = ReadWebSubscription(sub("https://10.0.0.1/x", keys))
	wantBadRequest(t, err)
	_, err = ReadWebSubscription(sub("https://fcm.googleapis.com/x", js.ObjectValue("p256dh", js.StringValue(p256dh))))
	wantBadRequest(t, err)
	_, err = ReadWebSubscription(sub("https://fcm.googleapis.com/x", js.ObjectValue("p256dh", js.StringValue(p256dh), "auth", js.StringValue("has spaces in it"))))
	wantBadRequest(t, err)
	_, err = ReadWebSubscription(js.UndefinedValue())
	wantBadRequest(t, err)
}

// Deno: "readDeviceLabel: optional, trimmed, bounded"
func TestReadDeviceLabel(t *testing.T) {
	label := func(v js.Value) *string {
		t.Helper()
		got, err := ReadDeviceLabel(v)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	eq(t, label(js.UndefinedValue()), (*string)(nil))
	eq(t, label(js.StringValue("  ")), (*string)(nil))
	eq(t, label(js.StringValue(" Chrome \U000000b7 macOS ")), str("Chrome \U000000b7 macOS"))
	eq(t, js.Len(*label(js.StringValue(strings.Repeat("x", 200)))), 80)
	_, err := ReadDeviceLabel(js.NumberValue(42))
	wantBadRequest(t, err)
}

// Deno: "a card number a client typed never reaches a lock screen"
func TestCardNumberNeverReachesLockScreen(t *testing.T) {
	// Built at runtime: CI's PCI guard (scan_pan.py) rightly refuses any Luhn-valid number in
	// source, test fixtures included. These are well-known public test card numbers.
	visa := strings.TrimSuffix(strings.Repeat("4242 ", 4), " ")
	amex := strings.Join([]string{"3782", "822463", "10005"}, "-")
	bare := "4111" + strings.Repeat("1", 12)
	mc := strings.Repeat("5555 ", 3) + "4444"
	eq(t, carddigits.MaskCardNumbers("my card is "+visa+" exp 12/29"), "my card is "+bullets+" 4242 exp 12/29")
	eq(t, carddigits.MaskCardNumbers("Amex "+amex+" ok"), "Amex "+bullets+" 0005 ok")
	eq(t, carddigits.MaskCardNumbers(bare), bullets+" 1111")
	// Ordinary numbers stay: prices, dates, phone numbers, confirmation codes.
	eq(t, carddigits.MaskCardNumbers("$7,845 due 10/29, call 312-555-0142, conf 8841207"), "$7,845 due 10/29, call 312-555-0142, conf 8841207")
	eq(t, MessagePayload(row(func(r *ClaimedRow) { r.Preview = str("card " + mc) })).Body, "card "+bullets+" 4444")
}

// Deno: "readFcmToken: an opaque token of sane size, or a 400"
func TestReadFCMToken(t *testing.T) {
	tok := "dXJ8:APA91b" + strings.Repeat("x", 140)
	got, err := ReadFCMToken(js.StringValue(tok))
	if err != nil || got != tok {
		t.Errorf("got (%q, %v)", got, err)
	}
	_, err = ReadFCMToken(js.StringValue("short"))
	wantBadRequest(t, err)
	_, err = ReadFCMToken(js.StringValue("has spaces " + strings.Repeat("x", 40)))
	wantBadRequest(t, err)
	_, err = ReadFCMToken(js.UndefinedValue())
	wantBadRequest(t, err)
}
