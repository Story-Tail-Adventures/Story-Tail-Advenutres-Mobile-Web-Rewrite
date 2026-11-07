package tripmessage

import (
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

var now = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)

func body(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return v
}

func wantDetail(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != status || p.Detail != detail {
		t.Errorf("got %v, want %d %q", err, status, detail)
	}
}

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/trip-message", nil))
	wantDetail(t, err, 400, "Use POST.")
}

func TestParseRefusals(t *testing.T) {
	id := uuid.NewAt(now)
	q := func(rest string) string { return `{"messageId":"` + id + `"` + rest + `}` }
	long := strings.Repeat("a", maxBody-1) + "\U0001F600" // 8001 UTF-16 units
	for _, c := range []struct{ name, in, detail string }{
		{"no id", `{}`, "Send a messageId."},
		{"id not a string", `{"messageId":7}`, "Send a messageId."},
		{"not v7", `{"messageId":"banana"}`, "messageId must be a recent UUID v7: Not a UUID v7: banana"},
		{"v4", `{"messageId":"0195a2c0-1a00-4000-8000-000000000001"}`,
			"messageId must be a recent UUID v7: Not a UUID v7: 0195a2c0-1a00-4000-8000-000000000001"},
		{"old", `{"messageId":"` + uuid.NewAt(now.Add(-61*time.Minute)) + `"}`,
			"messageId must be a recent UUID v7: UUID v7 timestamp is more than 3600000ms old"},
		{"future", `{"messageId":"` + uuid.NewAt(now.Add(61*time.Minute)) + `"}`,
			"messageId must be a recent UUID v7: UUID v7 timestamp is more than 3600000ms in the future"},
		{"trip number", q(`,"tripId":5`), "tripId must be a string."},
		{"trip object", q(`,"tripId":{}`), "tripId must be a string."},
		{"conversation bool", q(`,"conversationId":false`), "conversationId must be a string."},
		{"trip checked before conversation", q(`,"conversationId":1,"tripId":1`), "tripId must be a string."},
		{"both", q(`,"tripId":"a","conversationId":"b"`), "Send a tripId or a conversationId, not both."},
		{"both, even empty", q(`,"tripId":"","conversationId":""`), "Send a tripId or a conversationId, not both."},
		{"no body", q(``), "A message needs something in it."},
		{"blank body", q(`,"body":" \n\t` + "\U000000a0" + ` "`), "A message needs something in it."},
		{"body number", q(`,"body":42`), "A message needs something in it."},
		{"long body", q(`,"body":"` + long + `"`), "Keep it under 8000 characters."},
		{"attachments object", q(`,"body":"hi","attachmentDocumentIds":{}`), "attachmentDocumentIds must be an array."},
		{"attachments string", q(`,"body":"hi","attachmentDocumentIds":"x"`), "attachmentDocumentIds must be an array."},
		{"too many", q(`,"body":"hi","attachmentDocumentIds":["1","2","3","4","5","6","7","8","9","10","11"]`), "At most 10 attachments."},
		{"not strings", q(`,"body":"hi","attachmentDocumentIds":["a",null]`), "attachmentDocumentIds must be strings."},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parse(body(t, c.in), now)
			wantDetail(t, err, 400, c.detail)
		})
	}
}

func TestParseAccepts(t *testing.T) {
	id := uuid.NewAt(now.Add(-59 * time.Minute))
	got, err := parse(body(t, `{"messageId":"`+id+`","body":"  hello  ","attachmentDocumentIds":["b","a","b","c","a"]}`), now)
	if err != nil {
		t.Fatal(err)
	}
	if got.MessageID != id || got.Body != "hello" || got.TripGiven || got.TripID != nil || got.ConversationID != nil {
		t.Errorf("got %+v", got)
	}
	if !reflect.DeepEqual(got.Attachments, []string{"b", "a", "c"}) {
		t.Errorf("attachments %v", got.Attachments)
	}

	// An explicit null tripId is "given" (the audit metadata carries null), absent is not.
	got, _ = parse(body(t, `{"messageId":"`+id+`","body":"x","tripId":null,"conversationId":"c"}`), now)
	if !got.TripGiven || got.TripID != nil || got.ConversationID == nil || *got.ConversationID != "c" {
		t.Errorf("got %+v", got)
	}
	got, _ = parse(body(t, `{"messageId":"`+id+`","body":"x","tripId":"t","attachmentDocumentIds":null}`), now)
	if !got.TripGiven || got.TripID == nil || *got.TripID != "t" || got.Attachments != nil {
		t.Errorf("got %+v", got)
	}
	// Exactly 8000 UTF-16 units is allowed.
	if _, err := parse(body(t, `{"messageId":"`+id+`","body":"`+strings.Repeat("a", 7998)+"\U0001F600"+`"}`), now); err != nil {
		t.Errorf("8000 units refused: %v", err)
	}
}

func TestPreview(t *testing.T) {
	str := func(u []uint16) string { return string(utf16.Decode(u)) }
	if got := str(previewUnits("  hello \n\n  world\t ")); got != "hello world" {
		t.Errorf("one line: %q", got)
	}
	// A space after unit 120 is close enough: cut there.
	in := strings.Repeat("a", 125) + " " + strings.Repeat("b", 30)
	if got := str(previewUnits(in)); got != strings.Repeat("a", 125)+"\U00002026" {
		t.Errorf("word boundary: %q", got)
	}
	// A space at or before 120 is too far back: cut at 140.
	in = strings.Repeat("a", 120) + " " + strings.Repeat("b", 30)
	if got := str(previewUnits(in)); got != strings.Repeat("a", 120)+" "+strings.Repeat("b", 19)+"\U00002026" {
		t.Errorf("hard cut: %q", got)
	}
	if got := str(previewUnits(strings.Repeat("x", 140))); got != strings.Repeat("x", 140) {
		t.Errorf("140 fits: %q", got)
	}
	// An emoji across the cut leaves its high half, which JSON.stringify escapes.
	in = strings.Repeat("a", 139) + "\U0001F600" + "bbb"
	if got := string(previewJSON(in)); got != `"`+strings.Repeat("a", 139)+`\ud83d`+"\U00002026"+`"` {
		t.Errorf("lone surrogate: %s", got)
	}
	if got := string(previewJSON("say \"hi\" <ok> \U0001F600 \x01")); got != `"say \"hi\" <ok> `+"\U0001F600"+` \u0001"` {
		t.Errorf("escaping: %s", got)
	}
}

func TestRecentV7Problem(t *testing.T) {
	ms := now.Add(500 * time.Microsecond) // Date.now() has no sub-millisecond part
	if got := recentV7Problem(uuid.NewAt(now.Add(-time.Hour)), ms); got != "" {
		t.Errorf("exactly an hour old: %q", got)
	}
	if got := recentV7Problem(strings.ToUpper(uuid.NewAt(now)), now); got != "" {
		t.Errorf("upper case: %q", got)
	}
}
