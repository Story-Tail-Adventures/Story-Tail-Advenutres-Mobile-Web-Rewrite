package people

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"
	_ "time/tzdata" // the zone tests must not depend on the machine's zoneinfo
)

// Ported from web/lib/agent/queries.test.ts: the worklist and calendar cases. (The pipeline
// cases belong to the trips sub-area.) The reads themselves (a failed read is not an empty
// book) are exercised through the handler in handlers_test.go; here the builders run on rows.

func p[T any](v T) *T { return &v }

func kpiFixture() kpiRow {
	return kpiRow{
		AgentID: "0195a2c0-1a00-7000-8000-000000000001", AsOfDate: "2026-09-21", Currency: p("USD"),
		PipelineValueCents: 1250000, BookedMonthCents: 748000, CommissionExpectedCents: 94000,
		CommissionWeightedCents: 61000, CommissionConfidencePct: p(int64(65)), InquiryToBookDays: p(12.0),
		InquiryToBookSample: 4, ActiveClientCount: 7, ActiveTripCount: 3, NewInquiryCount: 2, UnreadMessageCount: 1,
	}
}

func tripFixture(mod func(*tripRow)) tripRow {
	t := tripRow{
		TripID: "0195a2c0-1a00-7000-8000-000000000041", ClientID: "0195a2c0-1a00-7000-8000-000000000011",
		ClientDisplayName: "Maya & Daniel Carter", Title: "Cabo, Four Nights", TripType: "leisure",
		Status: "booked", StatusChangedAt: "2026-09-01T12:00:00+00:00", TravelerCount: 2,
		TotalValueCents: 500000, Currency: "USD", Version: 1,
	}
	if mod != nil {
		mod(&t)
	}
	return t
}

func paymentFixture(mod func(*paymentRow)) paymentRow {
	r := paymentRow{
		MilestoneID: "0195a2c0-1a00-7000-8000-000000000071", TripID: "0195a2c0-1a00-7000-8000-000000000041",
		TripTitle: "Cabo, Four Nights", ClientDisplayName: "Maya & Daniel Carter", Kind: "supplier",
		Label: "Final balance", AmountCents: 250000, Currency: "USD", DueDate: p("2026-09-25"), Status: "due", DaysUntil: p(int64(4)),
	}
	if mod != nil {
		mod(&r)
	}
	return r
}

func messageFixture(mod func(*inboxRow)) inboxRow {
	r := inboxRow{
		ConversationID: "0195a2c0-1a00-7000-8000-000000000091", ClientDisplayName: "Maya & Daniel Carter",
		LastMessageAt: "2026-09-21T15:00:00+00:00", LastMessagePreview: p("Can we add a night?"), AgentUnreadCount: 1,
	}
	if mod != nil {
		mod(&r)
	}
	return r
}

func leadFixture(mod func(*leadListRow)) leadListRow {
	r := leadListRow{ID: "l1", FirstName: "Dana", Email: "dana@example.com", Source: "website", Status: "new",
		MessageCount: 1, LatestPreview: p("Hi"), FirstMessageAt: "2026-09-18T15:00:00Z", LastMessageAt: "2026-09-18T15:00:00Z"}
	if mod != nil {
		mod(&r)
	}
	return r
}

var chicago = identity{DisplayName: "Gyasi Story", TimeZone: "America/Chicago"}
var noon = time.Date(2026, 9, 21, 17, 0, 0, 0, time.UTC)

type board struct {
	k     kpiRow
	trips []tripRow
	due   []paymentRow
	inbox []inboxRow
	leads []leadListRow
}

func (b board) worklist(me identity, now time.Time) *worklist {
	return buildWorklist(me, b.k, b.trips, b.due, b.inbox, b.leads, now)
}

func tripIDs(rows []wlTrip) []string {
	var out []string
	for _, r := range rows {
		out = append(out, r.TripID)
	}
	return out
}

func TestAnEmptyBookIsAPopulatedWorklist(t *testing.T) {
	k := kpiFixture()
	k.ActiveTripCount, k.NewInquiryCount, k.Currency = 0, 0, nil
	w := board{k: k}.worklist(chicago, noon)
	if w == nil || len(w.Proposals) != 0 || len(w.Departing) != 0 || w.NeedsYouCount != 0 {
		t.Fatalf("empty book = %+v", w)
	}
}

func TestCancelledTrips(t *testing.T) {
	t.Run("are not travellers in the next 30 days", func(t *testing.T) {
		w := board{k: kpiFixture(), trips: []tripRow{
			tripFixture(func(r *tripRow) { r.TripID, r.StartDate = "going", p("2026-09-29") }),
			tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StartDate = "cancelled", "cancelled", p("2026-09-29") }),
			tripFixture(func(r *tripRow) { r.TripID, r.StartDate = "far-off", p("2026-12-01") }),
		}}.worklist(chicago, noon)
		if got := tripIDs(w.Departing); !slices.Equal(got, []string{"going"}) {
			t.Errorf("departing = %v", got)
		}
	})

	t.Run("draw neither a departure nor a return on the calendar", func(t *testing.T) {
		evs := calendarEvents([]tripRow{
			tripFixture(func(r *tripRow) { r.TripID, r.StartDate, r.EndDate = "going", p("2026-09-29"), p("2026-10-03") }),
			tripFixture(func(r *tripRow) {
				r.TripID, r.Status, r.StartDate, r.EndDate = "cancelled", "cancelled", p("2026-09-29"), p("2026-10-03")
			}),
		}, nil)
		var ids []string
		for _, e := range evs {
			ids = append(ids, e.ID)
		}
		slices.Sort(ids)
		if !slices.Equal(ids, []string{"dep-going", "ret-going"}) {
			t.Errorf("events = %v", ids)
		}
	})

	t.Run("draw no payment event either", func(t *testing.T) {
		evs := calendarEvents(
			[]tripRow{tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StartDate = "cancelled", "cancelled", p("2026-09-29") })},
			[]paymentRow{paymentFixture(func(r *paymentRow) { r.TripID = "cancelled" })},
		)
		if len(evs) != 0 {
			t.Errorf("events = %+v", evs)
		}
	})

	t.Run("keep a payment whose trip is not on the board: the filter fails open", func(t *testing.T) {
		evs := calendarEvents(
			[]tripRow{tripFixture(func(r *tripRow) { r.TripID, r.Status = "cancelled", "cancelled" })},
			[]paymentRow{paymentFixture(func(r *paymentRow) { r.MilestoneID, r.TripID = "orphan", "not-on-the-board" })},
		)
		if len(evs) != 1 || evs[0].ID != "pay-orphan" {
			t.Errorf("events = %+v", evs)
		}
	})

	t.Run("are not a payment to settle and do not inflate the count", func(t *testing.T) {
		w := board{k: kpiFixture(),
			trips: []tripRow{
				tripFixture(func(r *tripRow) { r.TripID = "live" }),
				tripFixture(func(r *tripRow) { r.TripID, r.Status = "gone", "cancelled" }),
			},
			due: []paymentRow{
				paymentFixture(func(r *paymentRow) { r.MilestoneID, r.TripID = "m-live", "live" }),
				paymentFixture(func(r *paymentRow) { r.MilestoneID, r.TripID = "m-gone", "gone" }),
			}}.worklist(chicago, noon)
		if len(w.Payments) != 1 || w.Payments[0].MilestoneID != "m-live" || w.NeedsYouCount != 1 {
			t.Errorf("payments = %+v, needsYou = %d", w.Payments, w.NeedsYouCount)
		}
	})

	t.Run("do not stop an inquiry or a proposal from being a traveller", func(t *testing.T) {
		w := board{k: kpiFixture(), trips: []tripRow{
			tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StartDate = "inq", "inquiry", p("2026-09-30") }),
			tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StartDate = "prop", "proposal", p("2026-10-02") }),
		}}.worklist(chicago, noon)
		if got := tripIDs(w.Departing); !slices.Equal(got, []string{"inq", "prop"}) {
			t.Errorf("departing = %v", got)
		}
	})
}

func TestRecentMessageDates(t *testing.T) {
	for _, c := range []struct {
		name string
		at   string
		zone string
	}{
		{"a late-evening Chicago message gets the day it was sent there", "2026-09-22T00:30:00+00:00", "America/Chicago"},
		{"a zone ahead of UTC skews the other way, and is right too", "2026-09-20T23:30:00+00:00", "Asia/Tokyo"},
	} {
		w := board{k: kpiFixture(), inbox: []inboxRow{messageFixture(func(r *inboxRow) { r.LastMessageAt = c.at })}}.
			worklist(identity{DisplayName: "Gyasi Story", TimeZone: c.zone}, noon)
		if w.Messages[0].TimeLabel != "Sep 21" {
			t.Errorf("%s: %q", c.name, w.Messages[0].TimeLabel)
		}
	}

	// the same zone the greeting uses
	at := time.Date(2026, 9, 22, 0, 30, 0, 0, time.UTC)
	w := board{k: kpiFixture(), inbox: []inboxRow{messageFixture(func(r *inboxRow) { r.LastMessageAt = "2026-09-22T00:30:00+00:00" })}}.
		worklist(chicago, at)
	if w.PartOfDay != "Evening" || w.Messages[0].TimeLabel != "Sep 21" {
		t.Errorf("partOfDay %q, label %q", w.PartOfDay, w.Messages[0].TimeLabel)
	}
}

func TestLocalDate(t *testing.T) {
	for _, c := range []struct{ ts, zone, want string }{
		// crosses the date line in both directions
		{"2026-09-22T00:30:00+00:00", "America/Chicago", "2026-09-21"},
		{"2026-09-20T23:30:00+00:00", "Asia/Tokyo", "2026-09-21"},
		{"2026-09-21T12:00:00+00:00", "UTC", "2026-09-21"},
		// the DST boundary an offset table would get wrong
		{"2026-09-16T04:30:00+00:00", "America/Chicago", "2026-09-15"},
		{"2026-12-16T05:30:00+00:00", "America/Chicago", "2026-12-15"},
		// an unrecognised zone falls back to the UTC date rather than failing
		{"2026-09-22T00:30:00+00:00", "Mars/Olympus_Mons", "2026-09-22"},
		// not a timestamp
		{"not a date", "America/Chicago", ""},
		// what PostgREST also writes: fractional seconds, and Z
		{"2026-09-22T00:30:00.123456+00:00", "America/Chicago", "2026-09-21"},
		{"2026-09-18T15:00:00Z", "UTC", "2026-09-18"},
	} {
		if got := localDate(c.ts, c.zone); got != c.want {
			t.Errorf("localDate(%q, %q) = %q, want %q", c.ts, c.zone, got, c.want)
		}
	}
}

func TestTheKPIStripTellsAnAbsenceFromAZero(t *testing.T) {
	find := func(w *worklist, id string) kpi {
		for _, k := range w.KPIs {
			if k.ID == id {
				return k
			}
		}
		t.Fatalf("no %s tile", id)
		return kpi{}
	}

	k := kpiFixture()
	k.CommissionConfidencePct = nil
	w := board{k: k}.worklist(chicago, noon)
	if find(w, "commission").Sub != "" {
		t.Error("a NULL confidence rendered a line")
	}
	for _, tile := range w.KPIs {
		if strings.Contains(tile.Sub, "0%") {
			t.Errorf("tile %s says %q", tile.ID, tile.Sub)
		}
	}

	k = kpiFixture()
	k.CommissionConfidencePct = p(int64(0))
	if got := find(board{k: k}.worklist(chicago, noon), "commission").Sub; got != "0% confidence" {
		t.Errorf("a real zero = %q", got)
	}

	k = kpiFixture()
	k.InquiryToBookDays, k.InquiryToBookSample = nil, 0
	if c := find(board{k: k}.worklist(chicago, noon), "cycle"); c.Value != "" || c.Unavailable != copyCycleUnavailable || c.Sub != "" {
		t.Errorf("missing cycle time = %+v", c)
	}

	k = kpiFixture()
	k.InquiryToBookDays, k.InquiryToBookSample = p(0.0), 1
	if c := find(board{k: k}.worklist(chicago, noon), "cycle"); c.Value != "0 d" || c.Unavailable != "" || c.Sub != "over 1 trip" {
		t.Errorf("a zero-day cycle = %+v", c)
	}

	k = kpiFixture()
	k.InquiryToBookDays = p(12.5)
	if c := find(board{k: k}.worklist(chicago, noon), "cycle"); c.Value != "12.5 d" {
		t.Errorf("a fractional cycle = %q", c.Value)
	}

	k = kpiFixture()
	k.Currency, k.PipelineValueCents = nil, 1250000
	if got := find(board{k: k}.worklist(chicago, noon), "pipeline").Value; got != "$12,500" {
		t.Errorf("pipeline = %q", got)
	}
}

func TestNewInquiriesAndNewLeads(t *testing.T) {
	w := board{k: kpiFixture(), trips: []tripRow{
		tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StatusChangedAt = "newer", "inquiry", "2026-09-19T15:00:00Z" }),
		tripFixture(func(r *tripRow) { r.TripID, r.Status, r.StatusChangedAt = "older", "inquiry", "2026-09-16T15:00:00Z" }),
	}}.worklist(chicago, noon)
	if got := tripIDs(w.Inquiries); !slices.Equal(got, []string{"older", "newer"}) {
		t.Errorf("inquiries = %v", got)
	}
	if !regexp.MustCompile(`^Waiting \d+ days?$|^Arrived today$`).MatchString(w.Inquiries[0].WaitLabel) {
		t.Errorf("wait label = %q", w.Inquiries[0].WaitLabel)
	}
	if w.Inquiries[0].WaitLabel != "Waiting 5 days" {
		t.Errorf("older inquiry waited %q, want Waiting 5 days", w.Inquiries[0].WaitLabel)
	}

	w = board{k: kpiFixture(), leads: []leadListRow{
		leadFixture(func(r *leadListRow) { r.ID, r.FirstMessageAt, r.LastName = "b", "2026-09-18T15:00:00Z", p("Reyes") }),
		leadFixture(func(r *leadListRow) { r.ID, r.FirstMessageAt = "a", "2026-09-17T15:00:00Z" }),
		leadFixture(func(r *leadListRow) { r.ID, r.Status = "c", "contacted" }),
		leadFixture(func(r *leadListRow) { r.ID, r.Status, r.AlreadyClient = "d", "converted", true }),
	}}.worklist(chicago, noon)
	var ids []string
	for _, l := range w.Leads {
		ids = append(ids, l.LeadID)
	}
	if !slices.Equal(ids, []string{"a", "b"}) || w.Leads[1].Name != "Dana Reyes" || w.NeedsYouCount != 2 {
		t.Errorf("leads = %+v, needsYou = %d", w.Leads, w.NeedsYouCount)
	}
}

func TestWaitingLabel(t *testing.T) {
	for _, c := range []struct{ today, since, want string }{
		{"2026-09-21", "2026-09-21T15:00:00Z", "Arrived today"},
		{"2026-09-21", "2026-09-20T15:00:00Z", "Waiting 1 day"},
		{"2026-09-21", "2026-09-17T15:00:00Z", "Waiting 4 days"},
		{"2026-09-21", "2026-09-22T03:00:00Z", "Arrived today"}, // the 21st in Chicago; never negative
		{"2026-09-21", "", ""},
	} {
		if got := waitingLabel(c.today, c.since, "America/Chicago"); got != c.want {
			t.Errorf("waitingLabel(%q) = %q, want %q", c.since, got, c.want)
		}
	}
}

func TestFormatting(t *testing.T) {
	for _, c := range []struct {
		cents Cents
		whole bool
		want  string
	}{
		{1250000, true, "$12,500"}, {5000000, true, "$50,000"}, {0, true, "$0"}, {99, true, "$1"},
		{12350, true, "$124"}, {12349, true, "$123"}, {123456789, true, "$1,234,568"},
		{12345, false, "$123.45"}, {12300, false, "$123"}, {-500, true, "-$5"},
	} {
		if got := formatMoney(c.cents, c.whole); got != c.want {
			t.Errorf("formatMoney(%d, %v) = %q, want %q", c.cents, c.whole, got, c.want)
		}
	}
	for _, c := range []struct{ today, then, want string }{
		{"2026-09-21", "2026-09-21", "Today"}, {"2026-09-21", "2026-09-22", "Tomorrow"},
		{"2026-09-21", "2026-09-25", "4 days"}, {"2026-09-21", "2026-09-20", "1 day late"},
		{"2026-09-21", "2026-09-11", "10 days late"}, {"2026-09-21", "", ""},
		{"2026-03-07", "2026-03-09", "2 days"}, // across the US DST change: whole days, not hours
	} {
		if got := relativeDay(c.today, c.then); got != c.want {
			t.Errorf("relativeDay(%q, %q) = %q, want %q", c.today, c.then, got, c.want)
		}
	}
	if monthDay("2026-09-05") != "Sep 05" || monthDay("") != "" {
		t.Errorf("monthDay = %q", monthDay("2026-09-05"))
	}
	for name, want := range map[string]string{
		"Maya & Daniel Carter": "MD", "dana": "D", "": "", "Maya\u00a0Carter": "MC", "Ana\u2003Bo": "AB",
		"&& Lee": "L", // ("ß x" is "SSX" in JS; Go has no special casing, and ß never starts a word)
	} {
		if got := initials(name); got != want {
			t.Errorf("initials(%q) = %q, want %q", name, got, want)
		}
	}
	if _, ok := loadZone("Local"); ok {
		t.Error("the server's Local zone must not stand in for an advisor's")
	}
	for _, c := range []struct {
		raw  string
		want Cents
	}{{`"1250000"`, 1250000}, {`1250000`, 1250000}, {`null`, 0}, {`""`, 0}, {`"x"`, 0}} {
		var got Cents
		if err := json.Unmarshal([]byte(c.raw), &got); err != nil || got != c.want {
			t.Errorf("Cents(%s) = %d, %v", c.raw, got, err)
		}
	}
	for _, n := range []int{0, 1, 2, 7} {
		want := "7 things need you today."
		switch n {
		case 0:
			want = copyGreetingZero
		case 1:
			want = copyGreetingOne
		case 2:
			want = "2 things need you today."
		}
		if got := needsYouLine(n); got != want {
			t.Errorf("needsYouLine(%d) = %q", n, got)
		}
	}
}
