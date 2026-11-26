package client_test

import (
	"net/http"
	"strings"
	"testing"
)

// Screen 2.2.9, the screen a push or an email lands on.

func TestTheUpdateScreenNarratesTheStatusItLandedOn(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", withStatusChangedAt(
		trip("t1", "Aruba in April", "proposal", "2029-04-03", "2029-04-07", 482000),
		"2027-03-14T18:00:00Z"))
	hn.f.rows("proposal", map[string]any{
		"id": "p1", "trip_id": "t1", "cover_title": "Family Week in Turks",
		"version_number": 2, "sent_at": "2027-03-14T17:00:00Z",
	})
	rec := hn.signedIn().get("/trips/t1/update")

	has(t, rec, "Status updated", "Your proposal is ready",
		esc("“Aruba in April” moved from an inquiry to a proposal."),
		// Only facts with a row behind them.
		"What changed", esc("Family Week in Turks · version 2"),
		// And the gentle list.
		esc("What’s next"), "Have a read, no rush",
		esc("Payments go straight to each supplier."),
		"View the proposal", `href="/trips/t1"`)
}

// A DATE, never "2 minutes ago": that is true at the instant the notification fires and a
// confident lie by the time somebody opens the email the next morning.
func TestTheUpdateScreenDatesTheChangeAndNeverCountsMinutes(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", withStatusChangedAt(
		trip("t1", "Aruba in April", "booked", "2029-04-03", "2029-04-07", 482000),
		"2027-03-14T18:00:00Z"))
	rec := hn.signedIn().get("/trips/t1/update")
	has(t, rec, "Mar 14, 2027")
	for _, never := range []string{" ago", "minutes", " min "} {
		if strings.Contains(strings.ToLower(rec.Body.String()), never) {
			t.Errorf("the page says %q", never)
		}
	}

	// A trip whose status never moved says so rather than printing nothing.
	fresh := newHarness(t)
	fresh.f.rows("trip", trip("t1", "Aruba in April", "inquiry", "2029-04-03", "2029-04-07", 482000))
	has(t, fresh.signedIn().get("/trips/t1/update"), "Recently", "Gyasi has your inquiry")
}

// Nothing in the schema records a DIFF, so a trip with no sent proposal, no published
// itinerary and nothing owed has no "What changed" card at all — a heading over nothing is
// worse than no heading.
func TestWithNoFactsThereIsNoWhatChangedCard(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Aruba in April", "inquiry", "2029-04-03", "2029-04-07", 482000))
	rec := hn.signedIn().get("/trips/t1/update")
	has(t, rec, esc("What’s next"), "Nothing to do yet")
	hasNot(t, rec, "What changed")
}

// A WAIVED milestone is a figure the traveler does not owe. Announcing it as the next
// payment on the screen they reach from a notification is the worst place to get that wrong.
func TestAWaivedMilestoneIsNeverAnnouncedAsThePayment(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Aruba in April", "booked", "2029-04-03", "2029-04-07", 482000))
	hn.f.rows("payment_milestone", map[string]any{
		"id": "m1", "trip_id": "t1", "kind": "final", "label": "Final payment",
		"amount_cents": 241000, "paid_cents": 0, "currency": "USD",
		"due_date": "2029-03-01", "status": "waived", "order_index": 1, "pay_url": nil,
	})
	rec := hn.signedIn().get("/trips/t1/update")
	hasNot(t, rec, "$2,410", "Final payment")
}

func TestTheUpdateScreenSendsEachStatusSomewhereUseful(t *testing.T) {
	for _, tc := range []struct{ status, label, href string }{
		{"inquiry", "Open the trip", "/trips/t1"},
		{"proposal", "View the proposal", "/trips/t1"},
		{"booked", "Read the itinerary", "/trips/t1/itinerary"},
		{"in_progress", "Read the itinerary", "/trips/t1/itinerary"},
		{"completed", "Open the memories", "/trips/t1/memories"},
		{"cancelled", "See the cancellation summary", "/trips/t1"},
	} {
		hn := newHarness(t)
		hn.f.rows("trip", trip("t1", "Aruba in April", tc.status, "2029-04-03", "2029-04-07", 482000))
		has(t, hn.signedIn().get("/trips/t1/update"), tc.label, `href="`+tc.href+`"`)
	}
}

// Somebody following a link from an email is not debugging. A trip that is not there and a
// read that failed are one answer here, and it is the one that gets them their bearings.
func TestAnUnreachableTripIsOneAnswer(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/trips/t9/update")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, esc("We couldn't find that trip"), `href="/trips"`)
}

func withStatusChangedAt(row map[string]any, at string) map[string]any {
	row["status_changed_at"] = at
	return row
}
