package client

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The traveler side's presentation, ported from web/lib/trips/*.test.ts and checked against
// the TypeScript it came from.

func TestStatusPresentation(t *testing.T) {
	const today = "2026-11-25"
	for _, c := range []struct {
		status TripStatus
		due    string
		chip   string
		label  string
		why    string
	}{
		{StatusInquiry, "", "inquiry", "Inquiry", ""},
		{StatusProposal, "", "proposal", "Proposal ready", ""},
		{StatusBooked, "", "booked", "Booked", "nothing due"},
		{StatusBooked, "2026-12-20", "booked", "Booked", "due in 25 days is not soon"},
		{StatusBooked, "2026-12-09", "due", "Final payment due", "due in a fortnight is"},
		{StatusBooked, "2026-11-01", "due", "Final payment due", "already overdue certainly is"},
		{StatusInProgress, "", "traveling", "Traveling now", ""},
		{StatusCompleted, "", "past", "Past trip", ""},
		{StatusCancelled, "2026-11-26", "cancelled", "Cancelled", "a cancelled trip owes nothing"},
	} {
		got := StatusPresentation(c.status, today, c.due)
		if got.Chip != c.chip || got.Label != c.label {
			t.Errorf("%s (%s) = %+v, want %s/%s", c.status, c.why, got, c.chip, c.label)
		}
	}
	// An unknown status still renders: a row that cannot draw itself is worse than one that
	// under-claims.
	if got := StatusPresentation("something_new", today, ""); got.Chip != "inquiry" {
		t.Errorf("unknown status = %+v", got)
	}
}

func TestDaysUntilDeparture(t *testing.T) {
	const today = "2026-11-25"
	for _, c := range []struct {
		start string
		days  int
		ok    bool
	}{
		{"2026-12-07", 12, true},
		{"2026-11-25", 0, true},
		{"2026-11-24", 0, false}, // never negative: the trip has begun
		{"", 0, false},
		{"not a date", 0, false},
	} {
		days, ok := DaysUntilDeparture(c.start, today)
		if days != c.days || ok != c.ok {
			t.Errorf("DaysUntilDeparture(%q) = %d %v", c.start, days, ok)
		}
	}
}

func TestFormatTripDates(t *testing.T) {
	for _, c := range []struct{ start, end, want string }{
		{"2027-04-03", "2027-04-07", "Apr 3 – 7, 2027"},
		{"2027-04-03", "2027-05-02", "Apr 3 – May 2, 2027"},
		{"2027-04-03", "", "Apr 3, 2027"},
		{"2026-12-30", "2027-01-02", "Dec 30 – Jan 2, 2027"},
		{"", "", "Dates to come"},
		// en-US, so September is "Sep" — the onboarding wizard's en-GB "Sept" is a different
		// screen's answer and the two must not drift into each other.
		{"2027-09-03", "2027-09-09", "Sep 3 – 9, 2027"},
	} {
		if got := FormatTripDates(c.start, c.end); got != c.want {
			t.Errorf("FormatTripDates(%q, %q) = %q, want %q", c.start, c.end, got, c.want)
		}
	}
}

func TestFormatDayAndLongDay(t *testing.T) {
	if got := FormatDay("2027-04-03"); got != "Apr 3" {
		t.Errorf("FormatDay = %q", got)
	}
	if got := FormatLongDay("2027-04-03"); got != "Saturday 3 April" {
		t.Errorf("FormatLongDay = %q", got)
	}
}

// Money is int64 cents the whole way (CLAUDE.md rule 5): nothing here ever divides into a
// float, so a long amount cannot drift in the last place.
func TestFormatMoney(t *testing.T) {
	for _, c := range []struct {
		cents int64
		want  string
		whole string
	}{
		{482000, "$4,820", "$4,820"},
		{482050, "$4,820.50", "$4,820"},
		{0, "$0", "$0"},
		{99, "$0.99", "$0"},
		{100000000, "$1,000,000", "$1,000,000"},
		{-2500, "-$25", "-$25"},
	} {
		if got := FormatMoney(c.cents, "USD"); got != c.want {
			t.Errorf("FormatMoney(%d) = %q, want %q", c.cents, got, c.want)
		}
		if got := FormatWholeMoney(c.cents, "USD"); got != c.whole {
			t.Errorf("FormatWholeMoney(%d) = %q, want %q", c.cents, got, c.whole)
		}
	}
	// An unrecognised currency is formatted as dollars rather than refused, as
	// formatTripMoney does — the business is USD only.
	if got := FormatMoney(482000, "EUR"); got != "$4,820" {
		t.Errorf("EUR = %q", got)
	}
}

func TestPhotoForTrip(t *testing.T) {
	// The destination decides first.
	if got := PhotoForTrip("t1", "cruise", []string{"Negril, Jamaica"}); got.Src != photos["jamaica"].Src {
		t.Errorf("Jamaica = %+v", got)
	}
	// Then the trip type.
	if got := PhotoForTrip("t1", "cruise", []string{"Somewhere new"}); got.Src != photos["cruiseShip"].Src {
		t.Errorf("cruise = %+v", got)
	}
	// Then the id, stably: the same trip keeps its photograph between loads.
	first := PhotoForTrip("0195a2c0-1a00-7000-8000-000000000001", "unknown", nil)
	again := PhotoForTrip("0195a2c0-1a00-7000-8000-000000000001", "unknown", nil)
	if first.Src != again.Src || first.Src == "" {
		t.Errorf("the fallback is not stable: %q then %q", first.Src, again.Src)
	}
	if got := PhotoURL(first, 800); !strings.HasPrefix(got, "https://images.unsplash.com/") ||
		!strings.Contains(got, "w=800&q=80&auto=format&fit=crop") {
		t.Errorf("PhotoURL = %q", got)
	}
}

// Every chip class a page can ask for has to exist in ui.css, and every photo key imagery.ts
// can return has to be in the registry — both are lists the compiler cannot check.
func TestChipClassesAndPhotoKeysAreComplete(t *testing.T) {
	for _, kind := range []string{"inquiry", "proposal", "booked", "due", "traveling", "past", "cancelled"} {
		if ChipClass(kind) != "status-"+kind {
			t.Errorf("ChipClass(%q) = %q", kind, ChipClass(kind))
		}
	}
	src, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "web", "lib", "trips", "imagery.ts"))
	if err != nil {
		t.Fatalf("reading imagery.ts: %v", err)
	}
	for _, key := range []string{"jamaica", "turks", "bahamas", "aruba", "stlucia", "bvi",
		"cruiseShip", "resortPool", "palmTree", "sunset", "snorkel", "overwater", "family"} {
		if photos[key].Src == "" {
			t.Errorf("the photo registry has no %q", key)
		}
		if !strings.Contains(string(src), `"`+key+`"`) {
			t.Errorf("imagery.ts never returns %q, so the registry carries a key nothing uses", key)
		}
	}
}

// The copy this package holds is the Next app's, word for word.
func TestTripCopyMatchesTheNextApp(t *testing.T) {
	read := func(parts ...string) string {
		raw, err := os.ReadFile(filepath.Join(append([]string{"..", "..", "..", ".."}, parts...)...))
		if err != nil {
			t.Fatalf("reading %v: %v", parts, err)
		}
		src := regexp.MustCompile(`['"]\s*\+\s*\n?\s*['"]`).ReplaceAllString(string(raw), "")
		return strings.NewReplacer(`\'`, "'", `\"`, `"`).Replace(src)
	}

	status := read("web", "lib", "trips", "status.ts")
	m := TripStatusMessages
	for name, want := range map[string]string{
		"inquiry": m.Inquiry, "proposalReady": m.ProposalReady, "booked": m.Booked,
		"finalPaymentDue": m.FinalPaymentDue, "travelingNow": m.TravelingNow,
		"pastTrip": m.PastTrip, "cancelled": m.Cancelled,
	} {
		if !strings.Contains(status, `"`+want+`"`) {
			t.Errorf("status.ts has no %s = %q", name, want)
		}
	}

	trips := read("web", "app", "(client)", "trips", "content.ts")
	for name, want := range map[string]string{
		"emptyAllTitle": tripsEmptyAllTitle, "emptyAllBody": tripsEmptyAllBody,
		"emptyFilteredTitle": tripsEmptyFilteredTitle, "emptyFilteredBody": tripsEmptyFilteredBody,
	} {
		if !strings.Contains(trips, want) {
			t.Errorf("trips/content.ts has no %s word for word:\n  %q", name, want)
		}
	}

	dash := read("web", "app", "(client)", "dashboard", "content.ts")
	for name, want := range map[string]string{
		"overlineRest": dashOverlineRest, "overlineNeutral": dashOverlineNeutral,
		"nextPaymentLabel": dashNextPayment,
	} {
		if !strings.Contains(dash, want) {
			t.Errorf("dashboard/content.ts has no %s word for word:\n  %q", name, want)
		}
	}

	pay := read("web", "app", "(client)", "trips", "[tripId]", "content.ts")
	for name, want := range map[string]string{
		"payDirect": payDirect, "payOpensNewTab": payOpensNewTab, "iPaid": iPaid,
		"iPaidThanks": iPaidThanks, "iPaidAlreadyDone": iPaidAlreadyDone,
	} {
		if !strings.Contains(pay, want) {
			t.Errorf("trips/[tripId]/content.ts has no %s word for word:\n  %q", name, want)
		}
	}
}

// The greeting is a copy decision made from data that was not put there for it: a rest
// framing only where the trip type makes it safe.
func TestGreeting(t *testing.T) {
	trip := func(days int, has bool, status TripStatus) *Trip {
		return &Trip{DaysUntil: days, HasDaysUntil: has, Status: status}
	}
	for _, c := range []struct {
		name    string
		trip    *Trip
		leisure bool
		want    string
	}{
		{"Jordan", nil, false, "Hello, Jordan."},
		{"Jordan", trip(0, true, StatusBooked), true, "Today’s the day, Jordan."},
		{"Jordan", trip(1, true, StatusBooked), true, "One more day, Jordan."},
		{"Jordan", trip(12, true, StatusBooked), true, "Hey Jordan — 12 days until you can finally breathe out."},
		// A group trip or a custom one may be a wedding or a funeral: warm, but neutral.
		{"Jordan", trip(12, true, StatusBooked), false, "Hey Jordan — 12 days to go."},
		{"Jordan", trip(0, false, StatusInProgress), true, "You’re there, Jordan."},
		{"Jordan", trip(0, false, StatusBooked), true, "Hello, Jordan."},
	} {
		if got := greeting(c.name, c.trip, c.leisure); got != c.want {
			t.Errorf("greeting = %q, want %q", got, c.want)
		}
	}
	if !isLeisure("cruise") || !isLeisure("all_inclusive") {
		t.Error("a cruise and an all-inclusive are holidays by construction")
	}
	for _, kind := range []string{"group", "multi_destination", "custom", ""} {
		if isLeisure(kind) {
			t.Errorf("%q must not get the rest framing", kind)
		}
	}
}
