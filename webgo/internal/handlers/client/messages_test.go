package client_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Screens 2.6.1, 2.6.2 and 2.6.3.

func conversation(id, subject, tripID, lastAt, preview string, unread int) map[string]any {
	row := map[string]any{
		"id": id, "subject": nil, "trip_id": nil, "last_message_at": lastAt,
		"last_message_preview": preview, "client_unread_count": unread, "trip": nil,
	}
	if subject != "" {
		row["subject"] = subject
	}
	if tripID != "" {
		row["trip_id"] = tripID
		row["trip"] = map[string]any{"title": subject}
	}
	return row
}

func seedInbox(hn *harness) {
	hn.f.rows("conversation",
		conversation("cv1", "Aruba in April", "t1", "2026-11-25T16:14:00Z", "Locked. Your final balance link is on your trip page.", 0),
		conversation("cv2", "", "", "2026-11-20T14:00:00Z", "Thinking about somewhere quiet in March.", 0),
	)
}

func TestTheInboxListsEveryThread(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	rec := hn.signedIn().get("/messages")

	has(t, rec, "Messages", "You and Gyasi, in one place.", "New message",
		// A trip thread is named for its trip; a thread with neither trip nor subject is
		// named for the person you are talking to.
		"Aruba in April", "Gyasi Story",
		esc("Locked. Your final balance link is on your trip page."),
		`href="/messages/cv1"`, `href="/messages/cv2"`,
		// The right pane before a thread is picked.
		"Pick a conversation", "Choose a thread on the left, or start a new one.")
	hasNot(t, rec, "No messages yet")
}

// An empty inbox and a failed read are different things, and this screen must not confuse
// them: "no messages yet" told to somebody with six threads is the lie that matters here.
func TestAnEmptyInboxAndAFailedReadAreNotTheSameScreen(t *testing.T) {
	hn := newHarness(t)
	empty := hn.signedIn().get("/messages")
	has(t, empty, "No messages yet", "Send Gyasi a message",
		esc("When you or Gyasi start a conversation"))

	broken := newHarness(t)
	broken.f.failTable("conversation")
	rec := broken.signedIn().get("/messages")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("= %d, want 503", rec.Code)
	}
	has(t, rec, esc("We couldn't load your messages"))
	hasNot(t, rec, "No messages yet")
}

// The search runs over WHAT THE ROW SHOWS, and the URL carries it — so it survives a reload
// and following a row keeps the list filtered.
func TestTheSearchFiltersWhatIsOnScreenAndRidesTheURL(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	c := hn.signedIn()

	rec := c.get("/messages?q=quiet")
	has(t, rec, "Gyasi Story", esc("Thinking about somewhere quiet in March."),
		// The row keeps the search, so the list beside the thread is the one they had.
		`href="/messages/cv2?q=quiet"`,
		// And the box still holds what they typed.
		`value="quiet"`)
	hasNot(t, rec, "Aruba in April")

	// Nothing matched is its own line, not the empty state.
	none := c.get("/messages?q=zzz")
	has(t, none, "Nothing matched that.")
	hasNot(t, none, "No messages yet")
}

// Search earns its place only once there is something to search. One thread and a search box
// is furniture.
func TestTheSearchBoxIsAbsentWithOneThread(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("conversation", conversation("cv1", "Aruba in April", "t1", "2026-11-25T16:14:00Z", "Locked.", 0))
	hasNot(t, hn.signedIn().get("/messages"), "Search your messages")
}

func TestAConversationOpensBesideTheList(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	hn.f.rows("message", message("m1", "agent", "I held one tentatively.", "2026-11-25T16:14:00Z"))
	rec := hn.signedIn().get("/messages/cv1")

	has(t, rec,
		// The list is still there, with the open row marked.
		`href="/messages/cv2"`, "is-active", `aria-current="page"`,
		// And the thread itself, with its own header: Back goes to the inbox, not a trip.
		"Aruba in April", esc("I held one tentatively."), "11:14a",
		`href="/messages"`, "Open trip", `href="/trips/t1"`,
		"Reply to Gyasi")
	hasNot(t, rec, "Pick a conversation")
}

// The general thread has no trip: no "Open trip", its attachments point at the account-wide
// library, and its empty state does not talk about a trip that does not exist.
func TestTheGeneralThreadNeverMentionsATrip(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	rec := hn.signedIn().get("/messages/cv2")
	has(t, rec, "Gyasi Story", "No messages yet",
		esc("This is where you and Gyasi talk. Ask anything"))
	hasNot(t, rec, "Open trip", esc("talk about this trip"))
}

// No row, not yours, and archived are ONE answer: conversation_self_select makes all three
// invisible, so none of them can be told apart and none of them should be.
func TestAConversationYouCannotSeeIsOneAnswer(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	hn.f.rows("conversation") // nothing readable
	rec := hn.signedIn().get("/messages/cv9")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("= %d, want 404", rec.Code)
	}
	has(t, rec, esc("We couldn't find that conversation"))
}

// Addressed by CONVERSATION, not trip: a general thread has no trip to key on, so the 2.2.7
// send cannot serve this screen at all.
func TestSendingIntoAThreadPostsTheConversationId(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	rec := hn.signedIn().post("/messages/cv2", url.Values{"body": {" Something quiet. "}})
	where(t, rec, http.StatusSeeOther, "/messages/cv2")

	sent := hn.f.one(t, "POST /functions/v1/trip-message").Body
	if sent["conversationId"] != "cv2" || sent["body"] != "Something quiet." {
		t.Errorf("sent %v", sent)
	}
	if _, ok := sent["tripId"]; ok {
		t.Error("a tripId went with it; this thread has no trip")
	}
}

// 2.6.3 SENDS NEITHER ID. That is what tells trip-message to find-or-create against
// trip_id IS NULL, so a traveler who writes twice lands in one thread rather than two.
func TestStartingAConversationSendsNeitherIdAndLandsInTheThread(t *testing.T) {
	hn := newHarness(t)
	hn.f.fnReply("trip-message", 200, map[string]any{"conversationId": "cv7"})
	rec := hn.signedIn().post("/messages/new", url.Values{"body": {"Somewhere quiet in March?"}})
	where(t, rec, http.StatusSeeOther, "/messages/cv7")

	sent := hn.f.one(t, "POST /functions/v1/trip-message").Body
	if sent["body"] != "Somewhere quiet in March?" {
		t.Errorf("sent %v", sent)
	}
	for _, key := range []string{"tripId", "conversationId"} {
		if _, ok := sent[key]; ok {
			t.Errorf("%s went with it; sending neither is what reaches the general thread", key)
		}
	}
}

// A reply with no conversation id should not strand somebody on a screen whose message has
// already been sent. The inbox is the honest fallback, and their message is in it.
func TestAStartedConversationWithNoIdStillLandsSomewhereTrue(t *testing.T) {
	hn := newHarness(t)
	hn.f.fnReply("trip-message", 200, map[string]any{"ok": true})
	rec := hn.signedIn().post("/messages/new", url.Values{"body": {"Hello"}})
	where(t, rec, http.StatusSeeOther, "/messages")
}

func TestARefusedStartKeepsWhatTheyWrote(t *testing.T) {
	hn := newHarness(t)
	hn.f.fnReply("trip-message", 503, map[string]any{"error": "upstream"})
	rec := hn.signedIn().post("/messages/new", url.Values{"body": {"Somewhere quiet in March?"}})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, esc("Somewhere quiet in March?"),
		esc("That didn't send — your words are still here. Try again in a moment."))
}

// THE SUBTITLE MUST NOT PROMISE A QUOTE. BRD §6.5 routes structured intake through
// quote-request; wording this as a quote would make it a second intake queue bypassing the
// pipeline that decision consolidated onto.
func TestTheNewMessageScreenAsksForProseAndPromisesNoQuote(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/messages/new")
	has(t, rec, "New message", "Message", esc("What's on your mind?"), "Send to Gyasi",
		esc("There is never a fee for asking."))
	for _, never := range []string{"quote", "estimate", "subject"} {
		if strings.Contains(strings.ToLower(rec.Body.String()), never) {
			t.Errorf("2.6.3 says %q", never)
		}
	}
}

// --- The forms, clicked the way a browser clicks them -------------------------------------

func TestEnterInAThreadSendsAndTheSearchKeepsItsPath(t *testing.T) {
	hn := newHarness(t)
	seedInbox(hn)
	c := hn.signedIn()
	body := c.get("/messages/cv1?q=aruba").Body.String()

	// The search posts back to the path it was drawn on, so filtering does not close the
	// thread beside it.
	search := readForm(t, body, "search-form")
	if search.action != "/messages/cv1" {
		t.Errorf("the search posts to %q", search.action)
	}

	compose := readForm(t, body, "send-form")
	if len(compose.submits) != 1 {
		t.Fatalf("the compose form has %d submits", len(compose.submits))
	}
	compose.fields.Set("body", "Yes please.")
	where(t, c.click(compose, compose.submits[0]), http.StatusSeeOther, "/messages/cv1")
	if got := hn.f.one(t, "POST /functions/v1/trip-message").Body["conversationId"]; got != "cv1" {
		t.Errorf("sent to %v", got)
	}
}

func TestTheNewMessageFormHasOneSubmitAndItSends(t *testing.T) {
	hn := newHarness(t)
	hn.f.fnReply("trip-message", 200, map[string]any{"conversationId": "cv7"})
	c := hn.signedIn()
	f := readForm(t, c.get("/messages/new").Body.String(), "new-form")
	if len(f.submits) != 1 {
		t.Fatalf("submits = %+v; the attach button is type=button and must not be one", f.submits)
	}
	f.fields.Set("body", "Somewhere quiet in March?")
	where(t, c.click(f, f.submits[0]), http.StatusSeeOther, "/messages/cv7")
}
