package client_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// Screens 2.2.6 Trip Documents, 2.5.4 the library, and 2.2.7 Memories.

func doc(id, kind, filename, mime string, size int64, owner string) map[string]any {
	return map[string]any{
		"id": id, "owner_user_id": owner, "trip_id": "t1", "kind": kind,
		"filename": filename, "mime_type": mime, "size_bytes": size,
		"created_at": "2026-11-0" + id[len(id)-1:] + "T00:00:00Z",
	}
}

func seedDocuments(hn *harness) {
	seedTrip(hn, "booked")
	hn.f.rows("document",
		doc("d1", "passport", "passport-jordan.pdf", "application/pdf", 1258291, "pu-1"),
		doc("d2", "supplier_confirmation", "resort-confirmation.pdf", "application/pdf", 20480, "pu-9"),
		doc("d3", "photo", "beach.jpg", "image/jpeg", 3500000, "pu-1"),
	)
}

func TestTripDocumentsGroupsAndNamesWhoAddedWhat(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	rec := hn.signedIn().get("/trips/t1/documents")
	has(t, rec, "Everything for Aruba in April, in one place.", "3 documents",
		"Supplier confirmations", "Passports &amp; visas", "Photos",
		"passport-jordan.pdf", "1.2 MB · added by you",
		"resort-confirmation.pdf", "20 KB · added by Gyasi",
		"PDF", "IMG",
		// Each row's form posts to that document's own open route.
		`action="/documents/d1/open"`, `name="next" value="/trips/t1/documents"`)
	// Groups come in their fixed order, confirmations before identity before photos.
	body := rec.Body.String()
	if strings.Index(body, "Supplier confirmations") > strings.Index(body, "Passports") {
		t.Error("the groups are out of order")
	}
}

func TestDocumentLibraryNamesTheTrip(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	rec := hn.signedIn().get("/documents")
	has(t, rec, "Travel documents", "Passports, visas, insurance — everything in one place.",
		"Aruba in April · 1.2 MB · added by you",
		esc("Stored encrypted, and only you and Gyasi can open them."))
}

func TestDocumentsEmptyStatesDifferByScreen(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	c := hn.signedIn()
	has(t, c.get("/trips/t1/documents"), "Nothing filed yet", esc("As Gyasi confirms each piece"))
	has(t, c.get("/documents"), "Nothing here yet", "Back to your trips")
}

func TestDocumentsReadFailureIsNotAnEmptyShelf(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("document")
	rec := hn.signedIn().get("/documents")
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't load your documents"))
	hasNot(t, rec, "Nothing here yet")
}

// Opening a file is a POST, and the page never carries a signed URL.
func TestOpeningADocumentMintsTheUrlOnPost(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	page := hn.signedIn().get("/trips/t1/documents")
	hasNot(t, page, "/storage/v1/object/sign", "token=")
	if calls := hn.f.seen("GET /functions/v1/trip-document-url"); len(calls) != 0 {
		t.Errorf("rendering the page minted %d signed urls", len(calls))
	}

	hn.f.fnReply("trip-document-url", 200, map[string]any{
		"path": "/storage/v1/object/sign/documents/d1.pdf?token=abc",
	})
	rec := hn.signedIn().post("/documents/d1/open", url.Values{"next": {"/trips/t1/documents"}})
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasSuffix(loc, "/storage/v1/object/sign/documents/d1.pdf?token=abc") ||
		!strings.HasPrefix(loc, hn.f.base) {
		t.Errorf("Location = %q, want the signed path on the Supabase host", loc)
	}
	if got := hn.f.one(t, "GET /functions/v1/trip-document-url").Query.Get("documentId"); got != "d1" {
		t.Errorf("documentId = %q", got)
	}
}

// A reply that tried to send the traveler off the Supabase host is refused.
func TestOpeningADocumentWillNotLeaveTheStorageHost(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	hn.f.fnReply("trip-document-url", 200, map[string]any{"path": "https://evil.example/file.pdf"})
	rec := hn.signedIn().post("/documents/d1/open", url.Values{"next": {"/documents"}})
	where(t, rec, http.StatusSeeOther, "/documents")
}

func TestOpeningADocumentThatFailsSaysSo(t *testing.T) {
	hn := newHarness(t)
	seedDocuments(hn)
	hn.f.fnReply("trip-document-url", 500, map[string]any{})
	c := hn.signedIn()
	rec := c.post("/documents/d1/open", url.Values{"next": {"/documents"}})
	where(t, rec, http.StatusSeeOther, "/documents")
	// The flash shows once, on the page they come back to.
	has(t, c.get("/documents"), esc("That file would not open just now."))
}

// --- 2.2.7 Memories --------------------------------------------------------------------------

func TestMemoriesIsWhereAFinishedTripLives(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000))
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": "2026-01-01T00:00:00Z",
		"closing_note": "You took the rest. That matters."})
	hn.f.rows("document", doc("d3", "photo", "beach.jpg", "image/jpeg", 3500000, "pu-1"))

	rec := hn.signedIn().get("/trips/t1/memories")
	has(t, rec, "Turks, last winter", "You took the rest. That matters.",
		"Your photos · 1", "beach.jpg", "Trip snapshot", "7 nights", "2 travelers", "$2,900 all-in",
		"What did you carry home from this trip?",
		esc("Whatever you write comes to Gyasi first. Nothing is published unless you say so."),
		"Somewhere like this again?", `href="/trips/t1/documents"`, `href="/trips/t1/itinerary"`)
}

func TestMemoriesSavesADraftAndSendsIt(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000))
	c := hn.signedIn()

	rec := c.post("/trips/t1/memories", url.Values{"body": {"  We slept.  "}, "intent": {"save"}})
	where(t, rec, http.StatusSeeOther, "/trips/t1/memories")
	body := hn.f.one(t, "POST /functions/v1/testimonial").Body
	if body["body"] != "We slept." || body["submit"] != false || body["tripId"] != "t1" {
		t.Errorf("saved = %v", body)
	}
	id, _ := body["testimonialId"].(string)
	if len(id) != 36 || id[14] != '7' {
		t.Errorf("testimonialId is not a v7 uuid: %q", id)
	}
	has(t, c.get("/trips/t1/memories"), esc("Saved. Come back to it whenever."))
}

// A reflection already sent shows the thank-you, not the form: it is with Gyasi now.
func TestMemoriesShowsTheThankYouOnceItIsSent(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000))
	hn.f.rows("testimonial", map[string]any{"id": "r1", "body": "We slept.", "rating": nil, "status": "submitted"})
	rec := hn.signedIn().get("/trips/t1/memories")
	has(t, rec, esc("Thank you — this is with Gyasi"))
	hasNot(t, rec, "Save for later", "Send it to Gyasi")
}

// A refused save keeps the words it refused.
func TestMemoriesKeepsTheWordsWhenTheSaveFails(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000))
	hn.f.fnReply("testimonial", 500, map[string]any{})
	rec := hn.signedIn().post("/trips/t1/memories", url.Values{"body": {"We slept."}, "intent": {"submit"}})
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, "We slept.", esc("That did not save. Your words are still here"))
}

// An empty box is not a save and not an error.
func TestMemoriesIgnoresAnEmptyReflection(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000))
	rec := hn.signedIn().post("/trips/t1/memories", url.Values{"body": {"   "}, "intent": {"save"}})
	if rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
	if calls := hn.f.seen("POST /functions/v1/testimonial"); len(calls) != 0 {
		t.Error("an empty box called the function")
	}
}
