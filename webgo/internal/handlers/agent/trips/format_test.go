package trips

import (
	"encoding/json"
	"testing"
	"time"
)

// Ported from web/lib/public/money.test.ts, web/lib/trips/status.test.ts and the
// formatting helpers lib/agent/queries.ts and lib/agent/trips.ts share. Cases first, then
// the code (docs/GO-MIGRATION.md §7).

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		cents int64
		whole bool
		want  string
	}{
		{329_000, false, "$3,290"},    // whole dollars without cents
		{185_050, false, "$1,850.50"}, // keeps cents when present
		{185_050, true, "$1,851"},     // unless asked for whole dollars (half away from zero)
		{185_049, true, "$1,850"},     //
		{0, true, "$0"},               //
		{99, false, "$0.99"},          //
		{1_284_500, true, "$12,845"},  // the template card's value
		{123_456_789_00, true, "$123,456,789"},
		{-185_050, true, "-$1,851"}, // Next throws here; Go never panics in a request
	}
	for _, c := range cases {
		if got := formatMoney(c.cents, c.whole); got != c.want {
			t.Errorf("formatMoney(%d, %v) = %q, want %q", c.cents, c.whole, got, c.want)
		}
	}
}

func TestCentsReadsDigitStringsAndNumbers(t *testing.T) {
	type row struct {
		V Cents `json:"v"`
	}
	cases := map[string]int64{
		`{"v":"1284500"}`:            1284500,
		`{"v":"900000000000000000"}`: 900000000000000000, // past 2^53: why the accessor sends text
		`{"v":42}`:                   42,
		`{"v":null}`:                 0,
		`{"v":""}`:                   0,
		`{"v":"-25"}`:                -25,
	}
	for in, want := range cases {
		var r row
		if err := json.Unmarshal([]byte(in), &r); err != nil {
			t.Errorf("%s: %v", in, err)
			continue
		}
		if int64(r.V) != want {
			t.Errorf("%s = %d, want %d", in, r.V, want)
		}
	}
	for _, bad := range []string{`{"v":"12.5"}`, `{"v":12.5}`, `{"v":"1e3"}`, `{"v":true}`, `{"v":"abc"}`} {
		var r row
		if err := json.Unmarshal([]byte(bad), &r); err == nil {
			t.Errorf("%s decoded as %d; a fraction or a word is not cents", bad, r.V)
		}
	}
}

const today = "2026-09-07"

func TestStatusPresentation(t *testing.T) {
	cases := []struct {
		status, due, chip, label string
	}{
		{"inquiry", "", "inquiry", "Inquiry"},
		{"proposal", "", "proposal", "Proposal ready"},
		{"booked", "", "booked", "Booked"},
		{"in_progress", "", "traveling", "Traveling now"},
		{"completed", "", "past", "Past trip"},
		{"cancelled", "", "cancelled", "Cancelled"},
		// The derived "Final payment due": inside the window, at the boundary, overdue.
		{"booked", "2026-09-14", "due", "Final payment due"},
		{"booked", "2026-09-21", "due", "Final payment due"},
		{"booked", "2026-09-22", "booked", "Booked"},
		{"booked", "2026-08-01", "due", "Final payment due"},
		// It never overrides a cancelled, completed or in-progress trip.
		{"cancelled", "2026-09-08", "cancelled", "Cancelled"},
		{"completed", "2026-09-08", "past", "Past trip"},
		{"in_progress", "2026-09-08", "traveling", "Traveling now"},
	}
	for _, c := range cases {
		chip, label := statusPresentation(c.status, c.due, today)
		if chip != c.chip || label != c.label {
			t.Errorf("statusPresentation(%q, %q) = %q %q, want %q %q", c.status, c.due, chip, label, c.chip, c.label)
		}
	}
	if d, ok := daysBetween(today, "2026-09-21"); !ok || d != dueSoonDays {
		t.Errorf("the boundary is %d days, want %d", d, dueSoonDays)
	}
	if _, ok := daysBetween(today, "not-a-date"); ok {
		t.Error("an unparseable date counted")
	}
	if d, _ := daysBetween("2026-11-01", "2026-11-02"); d != 1 {
		t.Errorf("across a DST boundary = %d, want 1", d)
	}
	// A status this code does not know never becomes the lead chip or an empty label.
	if chip, label := statusPresentation("archived", "", today); chip == "" || label == "" || chip == "lead" {
		t.Errorf("unknown status = %q %q", chip, label)
	}
}

func TestRelativeDay(t *testing.T) {
	cases := map[string]string{
		"2026-09-07": "Today",
		"2026-09-08": "Tomorrow",
		"2026-09-06": "1 day late",
		"2026-09-01": "6 days late",
		"2026-09-17": "10 days",
		"":           "",
	}
	for then, want := range cases {
		if got := relativeDay(today, then); got != want {
			t.Errorf("relativeDay(%q) = %q, want %q", then, got, want)
		}
	}
}

func TestMonthDayKeepsTheZero(t *testing.T) {
	// queries.ts monthDay splits the ISO string, so the day keeps its leading zero.
	if got := monthDay("2026-09-07"); got != "Sep 07" {
		t.Errorf("monthDay = %q", got)
	}
	if got := monthDay(""); got != "" {
		t.Errorf("monthDay(empty) = %q", got)
	}
}

func TestTravelLabel(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct{ start, end, want string }{
		{"", "", ""},
		{"2026-08-12", "", "Aug 12, 2026"},
		{"2026-08-12", "2026-08-19", "Aug 12 – 19, 2026"},
		{"2026-08-28", "2026-09-04", "Aug 28 – Sep 4, 2026"},
		{"2026-12-28", "2027-01-04", "Dec 28, 2026 – Jan 4, 2027"},
	}
	for _, c := range cases {
		if got := travelLabel(c.start, c.end, chicago); got != c.want {
			t.Errorf("travelLabel(%q, %q) = %q, want %q", c.start, c.end, got, c.want)
		}
	}
	// Noon UTC is the next calendar day in a zone fourteen hours ahead, as Intl formats it.
	kiritimati, err := time.LoadLocation("Pacific/Kiritimati")
	if err != nil {
		t.Fatal(err)
	}
	if got := travelLabel("2026-08-12", "", kiritimati); got != "Aug 13, 2026" {
		t.Errorf("travelLabel in +14 = %q", got)
	}
}
