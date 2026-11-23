package people

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// "Message client" (app/(agent)/agent/messages/new) and the two JSON endpoints: the
// notification's "Mark read" (§3.10.7) and the count the inbox polls.

const (
	msgClientID = "0195a2c0-1a00-7000-8000-000000000101"
	msgTripID   = "0195a2c0-1a00-7000-8000-000000000040"
	newPath     = "/agent/messages/new?client=" + msgClientID
)

func targetWorld(t *testing.T, over map[string]any) *world {
	t.Helper()
	wd := messagesWorld(t)
	row := map[string]any{
		"client_id": msgClientID, "client_display_name": "Nora Nologin", "client_first_name": "Nora",
		"trip_id": nil, "trip_title": nil, "conversation_id": nil, "client_can_sign_in": false,
	}
	for k, v := range over {
		row[k] = v
	}
	wd.fake.rpc["agent_message_target"] = mustJSON([]map[string]any{row})
	return wd
}

func TestNewMessagePage(t *testing.T) {
	t.Run("a box addressed to the client, with the inbox unfiltered beside it", func(t *testing.T) {
		wd := targetWorld(t, nil)
		rec := wd.get(newPath)
		b := rec.Body.String()
		if rec.Code != http.StatusOK {
			t.Fatalf("new = %d", rec.Code)
		}
		has(t, b, "Message Nora", "Nora Nologin · General", "Write a message…",
			"Nora hasn&#39;t set up a login yet", `name="client" value="`+msgClientID+`"`,
			// the list beside it is the plain inbox, not narrowed to this client
			"Maya Carter")
		lacks(t, b, "Pick a thread to read it here.", "Internal note")
		// A new thread cannot start with a note, so the switch is not offered.
		if strings.Count(b, `name="internalNote"`) != 0 {
			t.Error("the note switch is offered on a thread that does not exist yet")
		}
	})

	t.Run("a thread that already exists is not started twice", func(t *testing.T) {
		wd := targetWorld(t, map[string]any{"conversation_id": convID})
		rec := wd.get(newPath)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/messages/"+convID {
			t.Errorf("existing = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		// Trip Detail's "Remind the client" carries its milestone through to the thread.
		wd2 := targetWorld(t, map[string]any{"conversation_id": convID, "trip_id": msgTripID, "trip_title": "Negril"})
		rec = wd2.get("/agent/messages/new?client=" + msgClientID + "&trip=" + msgTripID + "&remind=" + convID)
		if want := "/agent/messages/" + convID + "?remind=" + convID; rec.Header().Get("Location") != want {
			t.Errorf("remind = %q, want %q", rec.Header().Get("Location"), want)
		}
	})

	t.Run("a client that is not theirs says so, and a malformed one is not found", func(t *testing.T) {
		wd := targetWorld(t, nil)
		wd.fake.rpc["agent_message_target"] = "[]"
		rec := wd.get(newPath)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("not theirs = %d", rec.Code)
		}
		has(t, rec.Body.String(), "That client isn&#39;t one of yours, or they&#39;ve been archived.")
		for _, bad := range []string{"/agent/messages/new", "/agent/messages/new?client=nope", "/agent/messages/new?client=" + msgClientID + "&trip=nope"} {
			if rec := wd.get(bad); rec.Code != http.StatusNotFound {
				t.Errorf("%s = %d", bad, rec.Code)
			}
		}
	})

	t.Run("a milestone only means something on a trip", func(t *testing.T) {
		m, ok := newMessageQueryFrom(url.Values{"client": {msgClientID}, "remind": {convID}})
		if !ok || m.Remind != "" {
			t.Errorf("remind without a trip = %+v", m)
		}
	})
}

func TestNewMessageSend(t *testing.T) {
	t.Run("starts the thread, then opens it", func(t *testing.T) {
		wd := targetWorld(t, nil)
		wd.fake.functions["POST agent-message"] = reply{200, `{"conversationId":"` + convID + `"}`}
		id := uuid.New()
		rec := wd.post(newPath, url.Values{"client": {msgClientID}, "messageId": {id},
			"draftFor": {draftFingerprint("Hello.", false)}, "body": {"Hello."}})
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/messages/"+convID {
			t.Fatalf("send = %d %q", rec.Code, rec.Header().Get("Location"))
		}
		c := wd.fake.callsTo("agent-message")[0]
		if string(c.Body["op"]) != `"send"` || string(c.Body["clientId"]) != `"`+msgClientID+`"` ||
			string(c.Body["messageId"]) != `"`+id+`"` || string(c.Body["internalNote"]) != "false" {
			t.Errorf("body = %v", c.Body)
		}
		if _, sent := c.Body["conversationId"]; sent {
			t.Error("a thread that does not exist was named")
		}
	})

	t.Run("a trip goes with it", func(t *testing.T) {
		wd := targetWorld(t, map[string]any{"trip_id": msgTripID, "trip_title": "Negril"})
		wd.fake.functions["POST agent-message"] = reply{200, `{"conversationId":"` + convID + `"}`}
		wd.post("/agent/messages/new?client="+msgClientID+"&trip="+msgTripID, url.Values{"body": {"Hello."}})
		if c := wd.fake.callsTo("agent-message")[0]; string(c.Body["tripId"]) != `"`+msgTripID+`"` {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("a refusal keeps the words and the id, and an empty body never goes", func(t *testing.T) {
		wd := targetWorld(t, nil)
		wd.fake.functions["POST agent-message"] = reply{422, `{"detail":"Start the thread with a message they can read."}`}
		id := uuid.New()
		rec := wd.post(newPath, url.Values{"client": {msgClientID}, "messageId": {id},
			"draftFor": {draftFingerprint("Keep <this>.", false)}, "body": {"Keep <this>."}})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("refused = %d", rec.Code)
		}
		has(t, rec.Body.String(), "Start the thread with a message they can read.", "Keep &lt;this&gt;.", `value="`+id+`"`)

		wd2 := targetWorld(t, nil)
		if rec := wd2.post(newPath, url.Values{"client": {msgClientID}, "body": {"  "}}); rec.Code != http.StatusUnprocessableEntity ||
			len(wd2.fake.callsTo("agent-message")) != 0 {
			t.Errorf("empty = %d", rec.Code)
		}
	})
}

// postJSON posts a JSON body to target, with an Origin header unless origin is "-".
func postJSON(t *testing.T, wd *world, target, body, origin string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if origin != "-" {
		req.Header.Set("Origin", origin)
	}
	cookies = append(cookies, wd.cookie())
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

func TestMarkReadEndpoint(t *testing.T) {
	const seen = "2026-10-15T14:02:11.123456+00:00"
	target := "/api/agent/messages/" + convID + "/read"

	t.Run("reads the thread up to the notified message, timestamp passed through as text", func(t *testing.T) {
		wd := messagesWorld(t)
		wd.fake.functions["POST agent-message"] = reply{200, `{"changed":true}`}
		rec := postJSON(t, wd, target, `{"seenUpTo":"`+seen+`"}`, "http://example.com")
		if rec.Code != http.StatusOK {
			t.Fatalf("read = %d %s", rec.Code, rec.Body.String())
		}
		var out map[string]bool
		if json.Unmarshal(rec.Body.Bytes(), &out) != nil || !out["changed"] {
			t.Errorf("answer = %s", rec.Body.String())
		}
		c := wd.fake.callsTo("agent-message")[0]
		if string(c.Body["op"]) != `"read"` || string(c.Body["seenUpTo"]) != `"`+seen+`"` ||
			string(c.Body["conversationId"]) != `"`+convID+`"` {
			t.Errorf("body = %v", c.Body)
		}
	})

	t.Run("refuses another site, or no Origin at all", func(t *testing.T) {
		wd := messagesWorld(t)
		for _, origin := range []string{"https://evil.example", "-"} {
			rec := postJSON(t, wd, target, `{"seenUpTo":"`+seen+`"}`, origin)
			if rec.Code != http.StatusForbidden {
				t.Errorf("origin %q = %d", origin, rec.Code)
			}
		}
		if n := len(wd.fake.callsTo("agent-message")); n != 0 {
			t.Errorf("a cross-site post wrote: %d calls", n)
		}
	})

	t.Run("refuses a malformed thread id, timestamp or body", func(t *testing.T) {
		wd := messagesWorld(t)
		for _, c := range []struct{ target, body string }{
			{"/api/agent/messages/not-a-uuid/read", `{"seenUpTo":"` + seen + `"}`},
			{target, `{"seenUpTo":"yesterday"}`},
			{target, `{}`},
			{target, `{not json`},
			{target, `{"seenUpTo":"2026-10-15T14:02:11.1234567+00:00"}`}, // 7 digits is not Postgres
		} {
			if rec := postJSON(t, wd, c.target, c.body, "http://example.com"); rec.Code != http.StatusBadRequest {
				t.Errorf("%s %s = %d", c.target, c.body, rec.Code)
			}
		}
		if n := len(wd.fake.callsTo("agent-message")); n != 0 {
			t.Errorf("a malformed post wrote: %d calls", n)
		}
	})

	t.Run("a signed-out caller gets a status, never a sign-in page", func(t *testing.T) {
		wd := messagesWorld(t)
		req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(`{"seenUpTo":"`+seen+`"}`))
		req.Header.Set("Origin", "http://example.com")
		rec := httptest.NewRecorder()
		wd.h.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("signed out = %d, want 401", rec.Code)
		}
	})
}

func TestMessageCountEndpoint(t *testing.T) {
	wd := messagesWorld(t)
	rec := wd.get("/api/agent/messages/count")
	if rec.Code != http.StatusOK {
		t.Fatalf("count = %d", rec.Code)
	}
	var out map[string]int64
	if json.Unmarshal(rec.Body.Bytes(), &out) != nil {
		t.Fatalf("answer = %s", rec.Body.String())
	}
	if out["unreadThreads"] != 2 || out["overdueThreads"] != 1 || out["unreadMessages"] != 3 {
		t.Errorf("counts = %v", out)
	}
	// Nothing about any one thread rides along.
	if strings.Contains(rec.Body.String(), "Maya") || strings.Contains(rec.Body.String(), convID) {
		t.Errorf("the count endpoint leaked a thread: %s", rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Error("a count with no Cache-Control can be served from the bfcache")
	}

	// The page carries the counts it was drawn with, for the poller to compare against.
	has(t, wd.get("/agent/messages").Body.String(), `data-counts="2:1"`)

	wd.fake.failing["agent_message_summary"] = true
	if rec := wd.get("/api/agent/messages/count"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("failed read = %d", rec.Code)
	}
}
