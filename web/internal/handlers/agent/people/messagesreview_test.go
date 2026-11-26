package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/uuid"
)

// What the go-reviewer pass on the messages screens proved, kept as regression tests.

// checkedBox reports whether the input carrying name is rendered checked.
func checkedBox(body, name string) bool {
	i := strings.Index(body, `name="`+name+`"`)
	if i < 0 {
		return false
	}
	start := strings.LastIndex(body[:i], "<input")
	end := i + strings.Index(body[i:], ">")
	return start >= 0 && strings.Contains(body[start:end], "checked")
}

// The worst of them: the whole internal-note treatment, including which button says "Add
// note", hangs off this checkbox. If a refusal brings the box back unchecked, the next Send
// posts a private note to the CLIENT.
func TestReviewRefusedNoteKeepsItsSwitch(t *testing.T) {
	wd := messagesWorld(t)
	wd.fake.functions["POST agent-message"] = reply{503, `{}`}
	body := "Do not tell them about the refund."
	rec := wd.post(threadURL, url.Values{
		"op": {"send"}, "body": {body}, "internalNote": {"true"},
		"messageId": {uuid.New()}, "draftFor": {draftFingerprint(body, true)},
	})
	b := rec.Body.String()
	if !checkedBox(b, "internalNote") {
		t.Error("the note switch came back off; the next Send would post this note to the client")
	}
	has(t, b, body)
	// And a refused REPLY does not come back as a note.
	wd2 := messagesWorld(t)
	wd2.fake.functions["POST agent-message"] = reply{503, `{}`}
	if checkedBox(wd2.post(threadURL, url.Values{"op": {"send"}, "body": {"hi"}}).Body.String(), "internalNote") {
		t.Error("a refused reply came back as a note")
	}
}

func TestReviewRefusedBulkArchiveSaysSo(t *testing.T) {
	wd := messagesWorld(t)
	wd.fake.functions["POST agent-message"] = reply{422, `{"detail":"Those threads are already archived."}`}
	rec := wd.post("/agent/messages", url.Values{"op": {"archive"}, "archived": {"true"}, "conversationId": {convID}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("refused bulk = %d", rec.Code)
	}
	has(t, rec.Body.String(), "Those threads are already archived.")

	// And an answer with no sentence of its own still says something.
	wd.fake.functions["POST agent-message"] = reply{500, `{}`}
	has(t, wd.post("/agent/messages", url.Values{"op": {"archive"}, "archived": {"true"}, "conversationId": {convID}}).Body.String(),
		"That didn&#39;t save. Try again in a moment.")
}

// Beside an open thread every filter keeps it open — so the thread's own forms have to carry
// those filters too, or replying drops the advisor back on an unfiltered page one.
func TestReviewThreadFormsKeepTheFilters(t *testing.T) {
	wd := messagesWorld(t)
	b := wd.get(threadURL + "?unread=1&overdue=1").Body.String()
	want := `action="` + threadURL + `?unread=1&amp;overdue=1"`
	if strings.Count(b, want) < 2 {
		t.Errorf("the reply and archive forms do not keep the filters; want %s", want)
	}
	wd.fake.functions["POST agent-message"] = reply{200, `{"conversationId":"` + convID + `"}`}
	rec := wd.post(threadURL+"?unread=1", url.Values{"op": {"send"}, "body": {"On it."}})
	if got := rec.Header().Get("Location"); got != threadURL+"?unread=1" {
		t.Errorf("after sending = %q", got)
	}
}

func TestReviewDraftIDFollowsTheWords(t *testing.T) {
	fresh := uuid.New()
	for _, c := range []struct {
		name, body  string
		note        bool
		id, mintFor string
		same        bool
	}{
		{"a retry of the same words keeps the id", "hi", false, fresh, draftFingerprint("hi", false), true},
		{"edited words get a new id", "hi there", false, fresh, draftFingerprint("hi", false), false},
		{"the same words as a note get a new id", "hi", true, fresh, draftFingerprint("hi", false), false},
		{"an id that is not v7 is replaced", "hi", false, "not-a-uuid", draftFingerprint("hi", false), false},
		// Minted long ago: the function's window for a client-minted v7 has passed, so a box
		// left open all afternoon mints afresh instead of being refused forever.
		{"an aged id is replaced", "hi", false, "0195a2c0-1a00-7000-8000-0000000000c1", draftFingerprint("hi", false), false},
	} {
		f := url.Values{"messageId": {c.id}, "draftFor": {c.mintFor}}
		got := draftID(f, c.body, c.note)
		if (got == c.id) != c.same {
			t.Errorf("%s: got %q (same=%v), want same=%v", c.name, got, got == c.id, c.same)
		}
		if !uuid.IsV7(got) {
			t.Errorf("%s: %q is not a v7", c.name, got)
		}
	}
}

func TestReviewStageFourMarksAreBothShown(t *testing.T) {
	for _, c := range []struct {
		m    threadMessageView
		mine bool
		want string
	}{
		{threadMessageView{CreatedAt: "2026-10-12T18:14:00Z", AutoReply: true, Emailed: true}, true, "1:14p · Automatic reply · Emailed"},
		{threadMessageView{CreatedAt: "2026-10-12T18:14:00Z", Emailed: true}, true, "1:14p · Emailed"},
		{threadMessageView{CreatedAt: "2026-10-12T18:14:00Z", AutoReply: true}, true, "1:14p · Automatic reply"},
		{threadMessageView{CreatedAt: "2026-10-12T18:14:00Z", ByEmail: true}, false, "1:14p · By email"},
		// The client's own marks are not the advisor's: an emailed flag on their message is
		// advisor-only and is not drawn on their side.
		{threadMessageView{CreatedAt: "2026-10-12T18:14:00Z", Emailed: true}, false, "1:14p"},
	} {
		if got := messageTimeLine(c.m, "America/Chicago", c.mine); got != c.want {
			t.Errorf("messageTimeLine = %q, want %q", got, c.want)
		}
	}
}

func TestReviewAnInternalNoteDrawsNoAttachment(t *testing.T) {
	wd := messagesWorld(t)
	wd.fake.rpc["agent_conversation_messages"] = mustJSON([]map[string]any{{
		"message_id": "m1", "sender_role": "agent", "body": "Keep this to myself.", "is_internal_note": true,
		"created_at": "2026-10-12T18:14:00.123456+00:00", "total_messages": 1, "emailed_at": nil, "channel": "app",
		"attachments": []any{map[string]any{"document_id": "d1", "filename": "secret-notes.pdf", "kind": "other"}},
	}})
	b := wd.get(threadURL).Body.String()
	has(t, b, "Keep this to myself.")
	lacks(t, b, "secret-notes.pdf")
}
