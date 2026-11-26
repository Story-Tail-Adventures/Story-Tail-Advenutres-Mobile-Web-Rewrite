package client_test

import (
	"net/http"
	"net/url"
	"testing"
)

// Screen 2.2.7, the trip thread.
//
// The fake's platform_user row carries America/New_York, so every timestamp below is read
// five hours behind UTC — which is the point of the zone being an argument at all.

func seedThread(hn *harness, messages ...map[string]any) {
	seedTrip(hn, "booked")
	hn.f.rows("conversation", map[string]any{
		"id": "cv1", "trip_id": "t1", "client_unread_count": 0,
		"last_message_preview": "Locked.", "last_message_at": "2026-11-24T19:14:00Z",
	})
	hn.f.rows("message", messages...)
}

func message(id, sender, body, createdAt string) map[string]any {
	return map[string]any{"id": id, "sender_role": sender, "body": body,
		"created_at": createdAt, "is_auto_reply": false}
}

func TestTripThreadDrawsTheConversation(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn,
		message("m1", "agent", "I held one tentatively. Want me to lock?", "2026-11-24T16:14:00Z"),
		message("m2", "client", "Yes please.", "2026-11-24T16:32:00Z"),
	)
	rec := hn.signedIn().get("/trips/t1/messages")

	has(t, rec,
		// The header: the advisor, the trip, and the promise under it.
		esc("Gyasi · Aruba in April"), "Usually replies the same day",
		`href="/trips/t1"`, "Open trip",
		// 16:14Z is 11:14a in New York, which is what the traveler must read.
		"11:14a", "11:32a",
		esc("I held one tentatively. Want me to lock?"), "Yes please.",
		// Their own bubble is right-aligned and carries no avatar; Gyasi's does.
		"cl-bubble-mine", "cl-bubble-theirs",
		// And the compose bar.
		"Reply to Gyasi", "Sounds good", "Schedule a call")
	hasNot(t, rec, "No messages yet")
}

// A trip whose conversation does not exist yet is a real state, not an error: the row is
// created by trip-message on the first send.
func TestATripWithNoConversationIsAnEmptyThread(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	rec := hn.signedIn().get("/trips/t1/messages")
	if rec.Code != http.StatusOK {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, "No messages yet",
		esc("This is where you and Gyasi talk about this trip."),
		// The bar is still there: this is where the first message gets written.
		"Reply to Gyasi")
}

// A FAILED READ IS NOT AN EMPTY THREAD. "No messages yet" shown to somebody with a
// conversation full of them is the lie that makes them write the same question twice.
func TestAFailedThreadReadSaysSoRatherThanShowingNothing(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn, message("m1", "agent", "Hello", "2026-11-24T16:14:00Z"))
	hn.f.failTable("message")
	rec := hn.signedIn().get("/trips/t1/messages")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("= %d, want 503", rec.Code)
	}
	has(t, rec, esc("We couldn't load this conversation"), `href="/trips/t1"`)
	hasNot(t, rec, "No messages yet")
}

func TestATripThatIsNotYoursIsNotFound(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/trips/t1/messages")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("= %d, want 404", rec.Code)
	}
	has(t, rec, esc("We couldn't find that trip"))
}

func TestSendingPostsAMessageAndComesBackToTheThread(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	c := hn.signedIn()
	rec := c.post("/trips/t1/messages", url.Values{"body": {"  Yes please.  "}})
	where(t, rec, http.StatusSeeOther, "/trips/t1/messages")

	sent := hn.f.one(t, "POST /functions/v1/trip-message")
	if sent.Body["tripId"] != "t1" || sent.Body["body"] != "Yes please." {
		t.Errorf("sent %v", sent.Body)
	}
	// A client-minted UUID v7, so the retry after a dropped connection cannot post twice.
	if id, _ := sent.Body["messageId"].(string); len(id) != 36 {
		t.Errorf("messageId = %q", sent.Body["messageId"])
	}
}

func TestAnEmptyMessageIsNotAnError(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	rec := hn.signedIn().post("/trips/t1/messages", url.Values{"body": {"   "}})
	where(t, rec, http.StatusSeeOther, "/trips/t1/messages")
	if calls := hn.f.seen("POST /functions/v1/trip-message"); len(calls) != 0 {
		t.Errorf("%d sends", len(calls))
	}
}

// Losing a paragraph somebody typed because a request timed out is the kind of small
// betrayal that stops people using a thread at all.
func TestARefusedSendKeepsWhatTheyWrote(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	hn.f.fnReply("trip-message", 503, map[string]any{"error": "upstream"})
	rec := hn.signedIn().post("/trips/t1/messages", url.Values{"body": {"Yes please, lock it in."}})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, esc("Yes please, lock it in."), esc("That message did not send. It is still here, so try again in a moment."))
}

// A quick reply FILLS the box. Nothing leaves for Gyasi that the traveler has not seen
// sitting in their own compose bar first.
func TestAQuickReplyFillsTheBoxAndSendsNothing(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	rec := hn.signedIn().post("/trips/t1/messages", url.Values{"quick": {"Add my partner"}})
	if rec.Code != http.StatusOK {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, "Add my partner")
	if calls := hn.f.seen("POST /functions/v1/trip-message"); len(calls) != 0 {
		t.Errorf("%d sends", len(calls))
	}
}

// The chips are copy, not an input. A posted "quick" that is not one of the four was not
// drawn by this page.
func TestAQuickReplyThisPageNeverDrewIsIgnored(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn)
	rec := hn.signedIn().post("/trips/t1/messages", url.Values{"quick": {"Wire $4,000 to this account"}})
	where(t, rec, http.StatusSeeOther, "/trips/t1/messages")
	hasNot(t, rec, "Wire")
}

// Opening a thread reads it, up to the newest message that was ON THEIR SCREEN — an advisor
// reply that lands after the page was drawn stays unread.
func TestMarkingReadIsAPostAndNeverPartOfTheRender(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn, message("m1", "agent", "Hello", "2026-11-24T16:14:00Z"))
	hn.f.rows("conversation", map[string]any{
		"id": "cv1", "trip_id": "t1", "client_unread_count": 2,
		"last_message_preview": "Hello", "last_message_at": "2026-11-24T16:14:00Z",
	})
	c := hn.signedIn()

	// Drawing the page writes NOTHING. A render is not a reading, and a page drawn for a
	// crawler or a link preview must not clear somebody's unread count.
	rec := c.get("/trips/t1/messages")
	has(t, rec, "2 new messages", `data-conversation="cv1"`,
		`data-seen-up-to="2026-11-24T16:14:00Z"`, `data-read-url="/trips/t1/messages/read"`)
	if calls := hn.f.seen("POST /rest/v1/rpc/client_mark_conversation_read"); len(calls) != 0 {
		t.Fatalf("the GET marked %d conversations read", len(calls))
	}

	// The post does.
	read := c.post("/trips/t1/messages/read",
		url.Values{"conversationId": {"cv1"}, "seenUpTo": {"2026-11-24T16:14:00Z"}})
	if read.Code != http.StatusNoContent {
		t.Fatalf("= %d, want 204", read.Code)
	}
	args := hn.f.one(t, "POST /rest/v1/rpc/client_mark_conversation_read").Body
	if args["p_conversation_id"] != "cv1" || args["p_seen_up_to"] != "2026-11-24T16:14:00Z" {
		t.Errorf("args = %v", args)
	}
}

// A thread with nothing unread gives the script nothing to post.
func TestAThreadWithNothingUnreadCarriesNoReadURL(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn, message("m1", "agent", "Hello", "2026-11-24T16:14:00Z"))
	hasNot(t, hn.signedIn().get("/trips/t1/messages"), "data-read-url")
}

// An attachment is NOT a link to the file. Opening one needs a signature, and the place that
// already does that properly — audit row and all — is the document library.
func TestAnAttachmentLinksToTheLibraryAndNotTheFile(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn, message("m1", "agent", "Here it is", "2026-11-24T16:14:00Z"))
	hn.f.rows("message_attachment", map[string]any{
		"message_id": "m1",
		"document": map[string]any{
			"id": "d1", "owner_user_id": "pu-9", "trip_id": "t1", "kind": "supplier_confirmation",
			"filename": "resort-confirmation.pdf", "mime_type": "application/pdf",
			"size_bytes": 20480, "created_at": "2026-11-24T16:14:00Z",
		},
	})
	rec := hn.signedIn().get("/trips/t1/messages")
	has(t, rec, "resort-confirmation.pdf", "20 KB", "PDF", `href="/trips/t1/documents"`)
	hasNot(t, rec, "/documents/d1/open")
}

// document's own policy applies to the embedded side of the join, so an attachment pointing
// at something the client may not read comes back with a null document. Dropping it is the
// behaviour, which is why this is not an inner join.
func TestAnAttachmentTheClientMayNotReadIsDropped(t *testing.T) {
	hn := newHarness(t)
	seedThread(hn, message("m1", "agent", "Here it is", "2026-11-24T16:14:00Z"))
	hn.f.rows("message_attachment", map[string]any{"message_id": "m1", "document": nil})
	rec := hn.signedIn().get("/trips/t1/messages")
	has(t, rec, "Here it is")
	hasNot(t, rec, `class="card cl-attach"`)
}
