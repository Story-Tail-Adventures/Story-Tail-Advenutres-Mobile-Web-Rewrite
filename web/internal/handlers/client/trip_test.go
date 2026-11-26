package client_test

import (
	"net/http"
	"strings"
	"testing"
)

// Screens 2.2.3, 2.2.4 and 2.2.5 against the fake Supabase.

func seedTrip(hn *harness, status string) {
	hn.f.rows("trip", trip("t1", "Aruba in April", status, "2029-04-03", "2029-04-07", 482000))
}

func TestTripDetailShowsTheTripAndItsTiles(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": "2026-11-01T00:00:00Z",
		"intro_note": "Four nights of nothing to do, which is the point."})
	hn.f.rows("itinerary_day", map[string]any{"id": "d1"}, map[string]any{"id": "d2"})
	hn.f.rows("document", map[string]any{"id": "doc1"})
	hn.f.rows("trip_component", map[string]any{"id": "c1"}, map[string]any{"id": "c2"})
	hn.f.rows("conversation", map[string]any{"id": "cv1", "client_unread_count": 2})

	rec := hn.signedIn().get("/trips/t1")
	has(t, rec, "Aruba in April", "status-booked",
		`href="/trips/t1/itinerary"`, "2 days, day by day",
		`href="/trips/t1/documents"`, "1 file",
		`href="/trips/t1/messages"`, "2 unread",
		"At a glance", "All-inclusive", "4 nights", "2 travelers", "$4,820 all-in", "2 booked",
		"Four nights of nothing to do, which is the point.")
}

// An unpublished itinerary is a tile that says why, not a link that goes nowhere.
func TestTripDetailDimsTheItineraryTileUntilItIsPublished(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": nil})
	rec := hn.signedIn().get("/trips/t1")
	has(t, rec, "Not published yet", `aria-disabled="true"`)
	hasNot(t, rec, `href="/trips/t1/itinerary"`)
}

// RLS answers somebody else's id as it answers one that never existed, and so does the page.
func TestTripDetailSaysNothingAboutSomebodyElsesTrip(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/trips/not-mine")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't find that trip"))
	hasNot(t, rec, "belongs to", "another traveler")
}

func TestTripDetailSendsAFinishedTripToItsMemories(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "completed")
	where(t, hn.signedIn().get("/trips/t1"), http.StatusSeeOther, "/trips/t1/memories")
}

// A cancelled trip keeps its value and its note but swaps the tiles for the summary.
func TestTripDetailCancelled(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", map[string]any{
		"id": "t1", "title": "Aruba in April", "trip_type": "all_inclusive", "status": "cancelled",
		"start_date": "2029-04-03", "end_date": "2029-04-07", "destinations": []string{"Aruba"},
		"traveler_count": 2, "total_value_cents": 482000, "total_paid_cents": 0, "currency": "USD",
		"cancellation_reason": "The resort closed for refurbishment.", "refund_status": "Refunded in full",
	})
	rec := hn.signedIn().get("/trips/t1")
	has(t, rec, "Cancellation summary", "The resort closed for refurbishment.", "Refunded in full",
		esc("When you're ready"), "At a glance", "status-cancelled")
	hasNot(t, rec, "PAYMENT TIMELINE", "A note from Gyasi")
}

// The timeline is a line per milestone, and a pay block only where one is still open AND
// carries a link this surface will show.
func TestTripDetailPaymentTimeline(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	hn.f.rows("payment_milestone",
		map[string]any{"id": "m1", "kind": "deposit", "label": "Deposit", "amount_cents": 120000,
			"paid_cents": 120000, "currency": "USD", "due_date": "2028-01-10", "status": "paid",
			"order_index": 1, "pay_url": "https://resort.example.com/pay/1"},
		map[string]any{"id": "m2", "kind": "final", "label": "Final payment", "amount_cents": 362000,
			"paid_cents": 0, "currency": "USD", "due_date": "2029-03-01", "status": "scheduled",
			"order_index": 2, "pay_url": "https://resort.example.com/pay/2"},
		map[string]any{"id": "m3", "kind": "extra", "label": "Excursions", "amount_cents": 40000,
			"paid_cents": 0, "currency": "USD", "due_date": nil, "status": "waived",
			"order_index": 3, "pay_url": nil},
	)
	rec := hn.signedIn().get("/trips/t1")
	has(t, rec, esc("Deposit · paid $1,200"), esc("Final payment · $3,620 due Mar 1"),
		esc("Excursions · waived by the supplier"),
		"Pay final payment", ">resort.example.com<",
		esc("What each supplier expects, and when. Story-Tail never charges you a fee."))
	// The paid one keeps its line and loses its button: there is nothing left to pay.
	if n := strings.Count(rec.Body.String(), "cl-pay-link"); n != 1 {
		t.Errorf("%d pay links, want one (only the open milestone)", n)
	}
	// The tile says what is next.
	has(t, rec, "$3,620 due Mar 1")
}

// --- 2.2.4 Itinerary -------------------------------------------------------------------------

func seedItinerary(hn *harness) {
	seedTrip(hn, "booked")
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": "2026-11-01T00:00:00Z",
		"intro_note": "Four nights of nothing to do, which is the point."})
	hn.f.rows("itinerary_day",
		map[string]any{"id": "d1", "day_number": 1, "date": "2029-04-03", "label": "Arrival",
			"summary": "A slow start, then the boat.",
			"weather_forecast": map[string]any{"high_f": 82, "low_f": 74, "summary": "Sunny",
				"wind_mph": 11, "wind_dir": "E", "uv_index": 9}},
		map[string]any{"id": "d2", "day_number": 2, "date": "2029-04-04", "label": nil, "summary": nil},
	)
	hn.f.rows("itinerary_activity", map[string]any{
		"id": "a1", "itinerary_day_id": "d1", "block": "afternoon", "start_time": "14:00:00",
		"end_time": "16:00:00", "title": "Check in at the resort",
		"body": "Ask for a room away from the lift.", "location": "Eagle Beach",
		"address": "J.E. Irausquin Blvd 250", "phone": "+1 (297) 555-0184",
		"confirmation_number": "ABC-123456", "gyasis_tip": "Ask for the corner table.",
		"order_index": 1,
	})
}

func TestItineraryListsItsDays(t *testing.T) {
	hn := newHarness(t)
	seedItinerary(hn)
	rec := hn.signedIn().get("/trips/t1/itinerary")
	has(t, rec, "Aruba in April", "Four nights of nothing to do, which is the point.",
		"Day 01", "Arrival", "Day 02", "Check in at the resort", "AFTERNOON", "14:00",
		`href="/trips/t1/itinerary/1"`, `href="/trips/t1/itinerary/2"`,
		// Day two has nothing on it, and says so rather than looking broken.
		"Day 2 is open",
		"Important info")
}

// No itinerary row at all is "not published yet", which is not an error and not a 404.
func TestItinerarySaysWhenItIsNotWrittenYet(t *testing.T) {
	hn := newHarness(t)
	seedTrip(hn, "booked")
	rec := hn.signedIn().get("/trips/t1/itinerary")
	if rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("Your itinerary isn't ready yet"), `href="/trips/t1"`)
}

func TestItineraryReadFailureDoesNotPretendItIsUnwritten(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("trip")
	rec := hn.signedIn().get("/trips/t1/itinerary")
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't find that itinerary"))
}

// --- 2.2.5 Day detail ------------------------------------------------------------------------

func TestDayDetailShowsEverythingOnTheDay(t *testing.T) {
	hn := newHarness(t)
	seedItinerary(hn)
	rec := hn.signedIn().get("/trips/t1/itinerary/1")
	has(t, rec, "Day 01", "Arrival", "Tuesday 3 April", "A slow start, then the boat.",
		esc("82° / 74° · Sunny · Wind 11 mph E"),
		esc("UV index 9 — pack the reef-safe sunscreen."),
		"Check in at the resort", "ABC-123456", esc("14:00 – 16:00"),
		esc("Ask for the corner table."),
		"https://www.google.com/maps/search/", `href="tel:+12975550184"`,
		// The mark-done module's hooks, and the key it stores under.
		`data-trip="t1"`, `data-day="1"`, `data-activity="a1"`,
		"/assets/js/client/mark-done")
	// Day one is the first, so there is a next and no previous.
	has(t, rec, `href="/trips/t1/itinerary/2"`, "Day 2")
	hasNot(t, rec, `href="/trips/t1/itinerary/0"`)
}

func TestDayDetailWithNothingPlanned(t *testing.T) {
	hn := newHarness(t)
	seedItinerary(hn)
	rec := hn.signedIn().get("/trips/t1/itinerary/2")
	has(t, rec, "Day 2 is open", esc("Nothing planned — which is allowed."))
	// Day two is the last, so there is a previous and no next.
	has(t, rec, `href="/trips/t1/itinerary/1"`)
}

// A day that is not in this itinerary, or a path that is not a number, goes back to the list
// rather than to a page with nothing on it.
func TestDayDetailFallsBackToTheList(t *testing.T) {
	hn := newHarness(t)
	seedItinerary(hn)
	c := hn.signedIn()
	for _, path := range []string{"/trips/t1/itinerary/99", "/trips/t1/itinerary/nope"} {
		where(t, c.get(path), http.StatusSeeOther, "/trips/t1/itinerary")
	}
}

// Nothing on these three screens writes anything, and nothing asks for a card.
func TestTheTripScreensOnlyRead(t *testing.T) {
	hn := newHarness(t)
	seedItinerary(hn)
	c := hn.signedIn()
	for _, path := range []string{"/trips/t1", "/trips/t1/itinerary", "/trips/t1/itinerary/1"} {
		body := c.get(path).Body.String()
		for _, never := range []string{"card number", "cvv", "autocomplete=\"cc-"} {
			if strings.Contains(strings.ToLower(body), never) {
				t.Errorf("%s mentions %q", path, never)
			}
		}
	}
	if hn.f.wrotePostgREST() {
		t.Error("a read-only screen wrote to PostgREST")
	}
	for _, fn := range []string{"trip-message", "agent-trip", "trip-document"} {
		if calls := hn.f.seen("POST /functions/v1/" + fn); len(calls) != 0 {
			t.Errorf("%s was called by a page that only reads", fn)
		}
	}
}
