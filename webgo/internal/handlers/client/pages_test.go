package client_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// The dashboard and the trip list, end to end against a fake Supabase: the shell's gate in
// front of them, what each reads, what the pay block does and — the point of several of
// these — what it does NOT do.

func TestTravelerPagesNeedASession(t *testing.T) {
	hn := newHarness(t)
	for _, path := range []string{"/dashboard", "/trips"} {
		where(t, hn.client().get(path), http.StatusSeeOther, "/login?next="+url.QueryEscape(path))
	}
}

// The (client) layout's gate, in its order: an unfinished wizard first, then the role.
func TestAnUnfinishedWizardIsSentBackToIt(t *testing.T) {
	hn := newHarness(t)
	hn.f.step = "preferences"
	where(t, hn.signedIn().get("/dashboard"), http.StatusSeeOther, "/onboarding/preferences")
}

func TestAnAgentIsSentToTheirWorklist(t *testing.T) {
	hn := newHarness(t)
	hn.f.role = "agent"
	where(t, hn.signedIn().get("/trips"), http.StatusSeeOther, "/agent")
}

// An admin has no traveler pages at all, and is told so rather than shown an empty list.
func TestAnAdminGetsTheNoAccessState(t *testing.T) {
	hn := newHarness(t)
	hn.f.role = "admin"
	rec := hn.signedIn().get("/dashboard")
	if rec.Code != http.StatusForbidden {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("You don't have access to this view"), `action="/account/sign-out"`)
	hasNot(t, rec, "No trips yet")
}

// --- 2.2.2 All trips -------------------------------------------------------------------------

func TestTripsListsAndCounts(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip",
		trip("t1", "Aruba in April", "booked", "2027-04-03", "2027-04-07", 482000),
		trip("t2", "Negril in June", "proposal", "2027-06-02", "2027-06-09", 310000),
		trip("t3", "Turks, last winter", "completed", "2026-01-08", "2026-01-15", 290000),
	)
	rec := hn.signedIn().get("/trips")
	has(t, rec, "Aruba in April", "Negril in June", "Turks, last winter",
		"$4,820", esc("Apr 3 – 7, 2027 · Aruba · 2 travelers"),
		`href="/trips/t1"`, "status-booked", "status-proposal", "status-past")
	// Every tab's count is over all the trips, so they do not change as you move between them.
	has(t, rec, "All · <span data-slot=\"count-all\">3", "Upcoming · <span data-slot=\"count-upcoming\">1")
}

func TestTripsFiltersByTab(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip",
		trip("t1", "Aruba in April", "booked", "2027-04-03", "2027-04-07", 482000),
		trip("t2", "Negril in June", "proposal", "2027-06-02", "2027-06-09", 310000),
	)
	rec := hn.signedIn().get("/trips?filter=planning")
	has(t, rec, "Negril in June", `aria-current="page"`)
	hasNot(t, rec, "Aruba in April")

	// A filter nobody could have clicked falls back to All rather than showing nothing.
	has(t, hn.signedIn().get("/trips?filter=../etc"), "Aruba in April", "Negril in June")
}

func TestTripsEmptyStatesDifferByTab(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	has(t, c.get("/trips"), "No trips yet", esc("Tell Gyasi roughly when and where"))
	hn.f.rows("trip", trip("t1", "Aruba in April", "booked", "2027-04-03", "2027-04-07", 482000))
	has(t, c.get("/trips?filter=cancelled"), "Nothing here", esc("Try another tab"))
}

// A read that FAILED is not an empty list: telling somebody with six trips that they have
// none is a lie the page should not tell.
func TestTripsReadFailureShowsTheErrorStateNotEmpty(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("trip")
	rec := hn.signedIn().get("/trips")
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't load your trips"))
	hasNot(t, rec, "No trips yet", "Nothing here")
}

// --- 2.2.1 Dashboard -------------------------------------------------------------------------

func TestDashboardHeroAndCountdown(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "Jordan", "preferred_name": nil})
	hn.f.rows("trip", trip("t1", "Aruba in April", "booked", "2029-04-03", "2029-04-07", 482000))
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": "2026-11-01T00:00:00Z"})
	rec := hn.signedIn().get("/dashboard")
	// The seeded trip is an all-inclusive, which is a holiday by construction, so the hero
	// is allowed its rest framing.
	has(t, rec, "Aruba in April", "WELCOME BACK", "Hey Jordan",
		esc("until you can finally breathe out."),
		`href="/trips/t1/itinerary"`, "View itinerary")
	hasNot(t, rec, "Gyasi is still writing this one")
}

// An unpublished itinerary is Gyasi's draft: the link is not there to be followed.
func TestDashboardDoesNotLinkAnUnpublishedItinerary(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", trip("t1", "Aruba in April", "booked", "2029-04-03", "2029-04-07", 482000))
	hn.f.rows("itinerary", map[string]any{"id": "i1", "published_at": nil})
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, "Gyasi is still writing this one")
	hasNot(t, rec, `href="/trips/t1/itinerary"`)
}

// The rest framing is only used where the trip type makes it safe.
func TestDashboardGreetingFollowsTheTripType(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "Jordan"})
	cruise := trip("t1", "Alaska", "booked", "2029-04-03", "2029-04-10", 482000)
	cruise["trip_type"] = "cruise"
	hn.f.rows("trip", cruise)
	has(t, hn.signedIn().get("/dashboard"), esc("until you can finally breathe out."), "YOUR REST IS COMING")

	group := trip("t1", "The wedding", "booked", "2029-04-03", "2029-04-10", 482000)
	group["trip_type"] = "group"
	hn.f.rows("trip", group)
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, esc("days to go."))
	hasNot(t, rec, "breathe out", "YOUR REST IS COMING")
}

func TestDashboardReadFailureShowsTheErrorState(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("trip")
	rec := hn.signedIn().get("/dashboard")
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't load your trips"))
	hasNot(t, rec, "No trip booked yet", "In planning")
}

func TestDashboardEmptyStateWhenNothingIsBooked(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "Jordan"})
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, "Hello, Jordan.", "No trip booked yet", "Ask Gyasi about something new",
		"Nothing in planning", "No past trips yet")
}

// --- The pay block ---------------------------------------------------------------------------

func seedPayable(hn *harness, payURL string) {
	hn.f.rows("trip", trip("t1", "Aruba in April", "booked", "2029-04-03", "2029-04-07", 482000))
	hn.f.rows("payment_milestone", map[string]any{
		"id": "m1", "trip_id": "t1", "kind": "final", "label": "Final payment",
		"amount_cents": 241000, "paid_cents": 0, "currency": "USD",
		"due_date": "2029-03-01", "status": "scheduled", "order_index": 1, "pay_url": payURL,
	})
}

// The link is shown, and the SITE is named beside it: a swapped link could send a traveler's
// money to the wrong place, so the page says whose site they are about to pay.
func TestPayBlockNamesTheSite(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://WWW.Resort.Example.com/pay/abc?amount=2410")
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, `href="https://WWW.Resort.Example.com/pay/abc?amount=2410"`,
		">resort.example.com<", "Pay final payment",
		esc("Paid directly to the supplier on their secure site."),
		"NEXT PAYMENT · DUE MAR 1", esc("Final payment · $2,410"))
}

// A link that is not https — or that is a look-alike nobody can read — is not shown at all.
func TestPayBlockRefusesAnythingButHttps(t *testing.T) {
	for _, bad := range []string{
		"http://resort.example.com/pay",
		"javascript:alert(1)",
		"/pay/abc",
		"",
	} {
		hn := newHarness(t)
		seedPayable(hn, bad)
		rec := hn.signedIn().get("/dashboard")
		hasNot(t, rec, "Pay final payment", "Paid directly to the supplier")
		// The card itself still shows what is owed; only the link goes.
		has(t, rec, esc("Final payment · $2,410"))
	}
}

// A unicode look-alike host renders as punycode, so it cannot pass as the real domain.
func TestPayBlockShowsALookAlikeHostAsPunycode(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://аpple.com/pay") // Cyrillic а
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, "xn--")
	hasNot(t, rec, ">apple.com<")
}

// "I've paid" posts a MESSAGE and marks nothing paid (CLAUDE.md rule 4).
func TestIvePaidOnlyPostsAMessage(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	c := hn.signedIn()
	rec := c.post("/trips/t1/paid", url.Values{"milestoneId": {"m1"}, "next": {"/dashboard"}})
	where(t, rec, http.StatusSeeOther, "/dashboard")

	body := hn.f.one(t, "POST /functions/v1/trip-message").Body
	if body["tripId"] != "t1" || body["body"] != "I've paid the final payment ($2,410)." {
		t.Errorf("message = %v", body)
	}
	id, _ := body["messageId"].(string)
	if len(id) != 36 || id[14] != '7' {
		t.Errorf("messageId is not a v7 uuid: %q", id)
	}
	// Nothing else was called: no milestone write of any kind.
	for _, name := range []string{"agent-trip", "agent-commission", "trip-document"} {
		if calls := hn.f.seen("POST /functions/v1/" + name); len(calls) != 0 {
			t.Errorf("%s was called by a traveler saying they had paid", name)
		}
	}
	if hn.f.wrotePostgREST() {
		t.Error("a traveler's post wrote to PostgREST directly")
	}
}

// A milestone the advisor has already marked paid sends nothing: the note would be wrong.
func TestIvePaidDoesNothingOnceItIsPaid(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	hn.f.rows("payment_milestone", map[string]any{
		"id": "m1", "trip_id": "t1", "label": "Final payment", "amount_cents": 241000,
		"paid_cents": 241000, "currency": "USD", "status": "paid", "order_index": 1,
		"pay_url": "https://resort.example.com/pay",
	})
	rec := hn.signedIn().post("/trips/t1/paid", url.Values{"milestoneId": {"m1"}})
	where(t, rec, http.StatusSeeOther, "/trips/t1")
	if calls := hn.f.seen("POST /functions/v1/trip-message"); len(calls) != 0 {
		t.Errorf("a paid milestone still sent a note: %v", calls)
	}
}

// The form's own action carries the trip, so a post cannot name a different one than the
// block it was pressed in, and `next` can only ever be a path on this site.
func TestIvePaidCannotBeSentSomewhereElse(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	rec := hn.signedIn().get("/dashboard")
	has(t, rec, `action="/trips/t1/paid"`, `name="next" value="/dashboard"`)

	off := hn.signedIn().post("/trips/t1/paid", url.Values{
		"milestoneId": {"m1"}, "next": {"https://evil.example/"},
	})
	if loc := off.Header().Get("Location"); strings.Contains(loc, "evil.example") {
		t.Errorf("Location = %q", loc)
	}
}

// Nothing on this surface takes a card number, and nothing on it says the word.
func TestNoTravelerPageAsksForACard(t *testing.T) {
	hn := newHarness(t)
	seedPayable(hn, "https://resort.example.com/pay")
	hn.f.rows("conversation", map[string]any{
		"id": "cv1", "trip_id": "t1", "client_unread_count": 0,
		"last_message_preview": "Locked.", "last_message_at": "2026-11-24T19:14:00Z",
	})
	c := hn.signedIn()
	// The thread is the one screen a traveler types into freely, so it is the one most
	// worth asserting has no card field and no autofill hint that would summon one.
	for _, path := range []string{"/dashboard", "/trips", "/trips/t1/messages"} {
		body := c.get(path).Body.String()
		for _, never := range []string{"card number", "cardNumber", "cvv", "autocomplete=\"cc-"} {
			if strings.Contains(strings.ToLower(body), strings.ToLower(never)) {
				t.Errorf("%s mentions %q", path, never)
			}
		}
	}
}

// Every traveler page is personal and none may be kept by a cache.
func TestNoTravelerPageIsCached(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	for _, path := range []string{"/dashboard", "/trips"} {
		if got := c.get(path).Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s Cache-Control = %q", path, got)
		}
	}
}
