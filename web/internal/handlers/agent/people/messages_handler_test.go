package people

import (
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/uuid"
)

// §3.10.1 and §3.10.2's handlers against the fake Supabase: the two columns rendered from the
// URL, the filters as links, the bulk archive, opening a thread (which reads it) and replying.

const (
	convID    = "0195a2c0-1a00-7000-8000-0000000000b0"
	threadURL = "/agent/messages/" + convID
)

func messagesWorld(t *testing.T) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_message_summary"] = mustJSON([]map[string]any{{
		"open_threads": 3, "unread_threads": 2, "unread_messages": 3, "overdue_threads": 1, "archived_threads": 4,
	}})
	wd.fake.rpc["agent_message_threads"] = mustJSON([]map[string]any{{
		"conversation_id": convID, "client_id": "k1", "client_display_name": "Maya Carter",
		"trip_id": "t1", "trip_title": "Sandals · Jul", "subject": nil,
		"last_message_at": "2026-10-12T18:14:00Z", "last_message_preview": "Yes lock the upgrade!",
		"last_sender_role": "client", "agent_unread_count": 2, "reply_due_at": nil,
		"overdue": false, "archived": false, "total_count": 1,
	}})
	wd.fake.rpc["agent_conversation"] = mustJSON([]map[string]any{{
		"conversation_id": convID, "client_id": "k1", "client_display_name": "Maya Carter",
		"client_first_name": "Maya", "trip_id": "t1", "trip_title": "Sandals · Jul", "subject": nil,
		"agent_unread_count": 2, "reply_due_at": nil, "overdue": false, "archived": false, "client_can_sign_in": false,
	}})
	wd.fake.rpc["agent_conversation_messages"] = mustJSON(
		[]map[string]any{
			{"message_id": "m1", "sender_role": "client", "body": "Yes lock <the> upgrade!", "is_internal_note": false,
				"created_at": "2026-10-12T18:14:00.123456+00:00", "attachments": []any{map[string]any{"document_id": "d1", "filename": "passport.pdf", "kind": "passport"}},
				"total_messages": 1, "emailed_at": nil, "channel": "email"},
		})
	// The fixtures describe ONE thread; a read for another is a read for somebody else.
	wd.scope("p_conversation_id", convID)
	return wd
}

func TestInboxPage(t *testing.T) {
	wd := messagesWorld(t)
	b := wd.get("/agent/messages").Body.String()
	has(t, b, "Maya Carter", "Yes lock the upgrade!", "Sandals · Jul", "2 unread · 1 overdue",
		"Archived (4)", "Templates", `href="`+threadURL+`"`, "Pick a thread to read it here.",
		`value="`+convID+`"`, "Search messages")
	lacks(t, b, "ppl-msg-thread-open", "No messages yet")

	// The filters are links that keep the rest of the query, and the search keeps them too.
	has(t, b, `href="/agent/messages?unread=1"`, `href="/agent/messages?overdue=1"`, `href="/agent/messages?view=archived"`)

	b = wd.get("/agent/messages?unread=1&overdue=1").Body.String()
	has(t, b, `href="/agent/messages?overdue=1"`, `href="/agent/messages?unread=1"`,
		`name="unread" value="1"`, `name="overdue" value="1"`, "chip-primary")

	// An empty list says which empty it is.
	wd.fake.rpc["agent_message_threads"] = "[]"
	has(t, wd.get("/agent/messages").Body.String(), "No messages yet. When a client writes to you, it shows up here.")
	has(t, wd.get("/agent/messages?q=passport").Body.String(), "No threads match these filters.", `value="passport"`)
	has(t, wd.get("/agent/messages?view=archived").Body.String(), "Nothing archived.", ">Inbox<")

	// A page past the end goes to the real last page, keeping the filters.
	wd.fake.rpc["agent_message_threads"] = "[]"
	rec := wd.get("/agent/messages?page=9&unread=1")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/messages?unread=1" {
		t.Errorf("past the end = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// A failed read is the retry page, never an empty inbox.
	wd.fake.failing["agent_message_threads"] = true
	if rec := wd.get("/agent/messages"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("failed read = %d", rec.Code)
	}
}

func TestThreadPage(t *testing.T) {
	wd := messagesWorld(t)
	rec := wd.get(threadURL)
	b := rec.Body.String()
	if rec.Code != http.StatusOK {
		t.Fatalf("thread = %d", rec.Code)
	}
	has(t, b, "ppl-msg-thread-open", "Maya Carter", "Sandals · Jul", "Yes lock &lt;the&gt; upgrade!",
		"passport.pdf", "1:14p · By email", `href="/agent/trips/t1"`, "Open trip", "Archive",
		"All messages", "Maya hasn&#39;t set up a login yet", `name="seenUpTo" value="2026-10-12T18:14:00.123456+00:00"`)
	// The list is beside it, with that row marked.
	has(t, b, `aria-current="page"`, "ppl-msg-active")
	lacks(t, b, "Pick a thread to read it here.", "Showing the latest 500 messages.")

	// Opening it reads it, up to the newest message shown and no further.
	calls := wd.fake.callsTo("agent-message")
	if len(calls) != 1 || string(calls[0].Body["op"]) != `"read"` ||
		string(calls[0].Body["seenUpTo"]) != `"2026-10-12T18:14:00.123456+00:00"` ||
		string(calls[0].Body["conversationId"]) != `"`+convID+`"` {
		t.Errorf("read = %v", calls)
	}

	// The reply box carries a fresh client-minted v7 id for the draft.
	i := strings.Index(b, `name="messageId" value="`)
	if i < 0 {
		t.Fatal("no messageId")
	}
	id := b[i+24 : i+24+36]
	if !uuidPattern.MatchString(id) {
		t.Errorf("messageId = %q", id)
	}

	// A thread that is not theirs, and one that is not a uuid, answer the same way.
	wd.fake.rpc["agent_conversation"] = "[]"
	if rec := wd.get(threadURL); rec.Code != http.StatusNotFound {
		t.Errorf("not theirs = %d", rec.Code)
	}
	if rec := wd.get("/agent/messages/nope"); rec.Code != http.StatusNotFound {
		t.Errorf("malformed = %d", rec.Code)
	}
}

func TestThreadReply(t *testing.T) {
	t.Run("sends the draft, then comes back to the thread with its filters", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{"conversationId":"` + convID + `"}`}
		id := uuid.New()
		rec := wd.post(threadURL+"?unread=1", url.Values{
			"op": {"send"}, "messageId": {id}, "draftFor": {draftFingerprint("On it.", false)}, "body": {"On it."},
			"seenUpTo": {"2026-10-12T18:14:00.123456+00:00"},
		})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != threadURL+"?unread=1" {
			t.Fatalf("send = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-message")[0]
		if string(c.Body["op"]) != `"send"` || string(c.Body["messageId"]) != `"`+id+`"` ||
			string(c.Body["body"]) != `"On it."` || string(c.Body["internalNote"]) != "false" ||
			string(c.Body["conversationId"]) != `"`+convID+`"` || string(c.Body["seenUpTo"]) != `"2026-10-12T18:14:00.123456+00:00"` {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("an internal note is sent as one", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{"conversationId":"` + convID + `"}`}
		wd.post(threadURL, url.Values{"op": {"send"}, "body": {"Call them back."}, "internalNote": {"true"}})
		if c := wd.fake.callsTo("agent-message")[0]; string(c.Body["internalNote"]) != "true" {
			t.Errorf("note = %v", c.Body)
		}
	})

	t.Run("a refusal keeps every word, the note switch and the draft's id", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{422, `{"detail":"Start the thread with a message they can read."}`}
		id := uuid.New()
		rec := wd.post(threadURL, url.Values{"op": {"send"}, "messageId": {id}, "draftFor": {draftFingerprint("Keep <this>.", true)},
			"body": {"Keep <this>."}, "internalNote": {"true"}})
		b := rec.Body.String()
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("refused = %d", rec.Code)
		}
		has(t, b, "Start the thread with a message they can read.", "Keep &lt;this&gt;.", `name="messageId" value="`+id+`"`)
	})

	t.Run("an empty body never reaches the function", func(t *testing.T) {
		wd := messagesWorld(t)
		rec := wd.post(threadURL, url.Values{"op": {"send"}, "body": {"   "}})
		if rec.Code != http.StatusUnprocessableEntity || len(wd.fake.callsTo("agent-message")) != 0 {
			t.Errorf("empty = %d, calls %d", rec.Code, len(wd.fake.callsTo("agent-message")))
		}
	})

	t.Run("a send the function cannot place is not a send", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{}`}
		rec := wd.post(threadURL, url.Values{"op": {"send"}, "body": {"hi"}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("no conversation back = %d", rec.Code)
		}
		has(t, rec.Body.String(), "That didn&#39;t send. Try again in a moment.")
	})
}

func TestThreadAndBulkArchive(t *testing.T) {
	t.Run("the thread's own Archive, and Move to inbox when it is archived", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{"moved":1}`}
		rec := wd.post(threadURL, url.Values{"op": {"archive"}, "archived": {"true"}})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != threadURL {
			t.Fatalf("archive = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-message")[0]
		if string(c.Body["op"]) != `"archive"` || string(c.Body["archived"]) != "true" ||
			string(c.Body["conversationIds"]) != `["`+convID+`"]` {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("the inbox's bulk archive posts the ticked ids and says what moved", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{"moved":2}`}
		rec := wd.post("/agent/messages?unread=1", url.Values{
			"op": {"archive"}, "archived": {"true"}, "conversationId": {convID, "not-a-uuid"},
		})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/messages?unread=1" {
			t.Fatalf("bulk = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		if c := wd.fake.callsTo("agent-message")[0]; string(c.Body["conversationIds"]) != `["`+convID+`"]` {
			t.Errorf("a malformed id reached the function: %v", c.Body)
		}
		has(t, wd.getWith("/agent/messages?unread=1", cookieNamed(rec, receiptCookie)).Body.String(), "2 archived")
	})

	t.Run("nothing ticked writes nothing", func(t *testing.T) {
		wd := messagesWorld(t)
		rec := wd.post("/agent/messages", url.Values{"op": {"archive"}, "archived": {"true"}})
		if rec.Code != http.StatusSeeOther || len(wd.fake.callsTo("agent-message")) != 0 {
			t.Errorf("empty bulk = %d, calls %d", rec.Code, len(wd.fake.callsTo("agent-message")))
		}
	})

	t.Run("a refused archive stays on the page with the reason", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{422, `{"detail":"That thread is already archived."}`}
		rec := wd.post(threadURL, url.Values{"op": {"archive"}, "archived": {"true"}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("refused = %d", rec.Code)
		}
		has(t, rec.Body.String(), "That thread is already archived.")
		if rec := wd.post(threadURL, url.Values{"op": {"nonsense"}}); rec.Code != http.StatusBadRequest {
			t.Errorf("unknown op = %d", rec.Code)
		}
	})
}
