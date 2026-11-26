package money

import (
	"encoding/json"
	"testing"
)

// §3.7.1's view model, a port of the dashboard half of web/lib/agent/commission.test.ts.
//
// What it pins, each invisible until it is wrong:
//
//  1. NULL MEANS THE READ FAILED. An advisor with nothing yet gets tiles of zeros; an
//     advisor whose read fell over gets a retry. Mixing them up shows "$0 received this
//     year" to somebody whose year was fine.
//  2. NULL IS NOT ZERO. No rate is not 0%, and last year with nothing in it is not "−100%".
//  3. ONLY AN EXACT DRILL IS A LINK.

// dashJSON is the test row, as the accessor sends it (bigint cast to text).
const dashJSON = `{
  "as_of_date": "2026-10-11",
  "currency": "USD",
  "ytd_received_cents": "306818",
  "ly_received_cents": "81794",
  "avg_rate_pct": 12.1,
  "ly_avg_rate_pct": 12.0,
  "upcoming_commission_cents": "467356",
  "upcoming_trip_count": 5,
  "at_risk_cents": "2558",
  "disputed_count": 1,
  "trailing_12_cents": "385818",
  "prior_12_cents": "96144"
}`

func dash(t *testing.T, overrides map[string]any) dashboardRow {
	t.Helper()
	var raw map[string]any
	if err := json.Unmarshal([]byte(dashJSON), &raw); err != nil {
		t.Fatal(err)
	}
	for k, v := range overrides {
		raw[k] = v
	}
	b, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	var row dashboardRow
	if err := json.Unmarshal(b, &row); err != nil {
		t.Fatal(err)
	}
	return row
}

// months is the twelve the chart draws: one $1,000 month, one $40 month, the rest empty.
func months(zero bool) []monthRow {
	starts := []string{
		"2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
		"2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01",
	}
	out := make([]monthRow, 0, len(starts))
	for i, s := range starts {
		cents := Cents(0)
		switch {
		case zero:
		case i == 6:
			cents = 100000
		case i == 11:
			cents = 4000
		}
		out = append(out, monthRow{MonthStart: s, ReceivedCents: cents})
	}
	return out
}

func TestDashboardTiles(t *testing.T) {
	t.Run("draws the prototype's four, in its order", func(t *testing.T) {
		var ids []string
		for _, tl := range dashboardTiles(dash(t, nil)) {
			ids = append(ids, tl.ID)
		}
		want := []string{"ytd", "upcoming", "risk", "rate"}
		for i := range want {
			if i >= len(ids) || ids[i] != want[i] {
				t.Fatalf("tiles are %v, want %v", ids, want)
			}
		}
	})

	t.Run("formats each figure and its second line", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, nil))
		for i, want := range [][2]string{
			{"$3,068", "+275% vs last year"},
			{"$4,674", "5 trips"},
			{"$26", "1 disputed"},
			{"12.1%", "+0.1 pts vs last year"},
		} {
			if tiles[i].Value != want[0] || tiles[i].Sub != want[1] {
				t.Errorf("tile %s is %q / %q, want %q / %q", tiles[i].ID, tiles[i].Value, tiles[i].Sub, want[0], want[1])
			}
		}
	})

	t.Run("says nothing about change when last year had nothing to change from", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, map[string]any{"ly_received_cents": "0", "ly_avg_rate_pct": nil}))
		if tiles[0].Sub != "" || tiles[3].Sub != "" {
			t.Fatalf("subs are %q and %q, want neither", tiles[0].Sub, tiles[3].Sub)
		}
	})

	t.Run("renders no rate as an explanation, not 0%", func(t *testing.T) {
		rate := dashboardTiles(dash(t, map[string]any{"avg_rate_pct": nil}))[3]
		if rate.Value != "" || rate.Unavailable != "Nothing received yet this year." {
			t.Fatalf("rate tile is %+v", rate)
		}
	})

	t.Run("links At risk to the disputed lines, and only when there are some", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, nil))
		if tiles[2].Href != "/agent/commission/ledger?status=disputed" {
			t.Fatalf("At risk links to %q", tiles[2].Href)
		}
		quiet := dashboardTiles(dash(t, map[string]any{"disputed_count": 0, "at_risk_cents": "0"}))
		if quiet[2].Href != "" {
			t.Fatalf("At risk links to %q with nothing disputed", quiet[2].Href)
		}
		// The others would drill to lists that sum to something else.
		for _, i := range []int{0, 1, 3} {
			if tiles[i].Href != "" {
				t.Errorf("tile %s links to %q", tiles[i].ID, tiles[i].Href)
			}
		}
	})

	t.Run("names the quiet states in words", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, map[string]any{
			"upcoming_commission_cents": "0", "upcoming_trip_count": 0,
			"at_risk_cents": "0", "disputed_count": 0,
		}))
		if tiles[1].Sub != "Nothing priced in the next 90 days" {
			t.Errorf("upcoming sub is %q", tiles[1].Sub)
		}
		if tiles[2].Sub != "Nothing disputed" {
			t.Errorf("risk sub is %q", tiles[2].Sub)
		}
	})

	t.Run("uses a true minus sign for a fall", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, map[string]any{"ytd_received_cents": "50000", "ly_received_cents": "100000"}))
		if tiles[0].Sub != "−50% vs last year" {
			t.Fatalf("sub is %q", tiles[0].Sub)
		}
	})

	t.Run("says 'No change' rather than '±0%' when nothing moved", func(t *testing.T) {
		tiles := dashboardTiles(dash(t, map[string]any{
			"ytd_received_cents": "81794", "avg_rate_pct": 12.04, "ly_avg_rate_pct": 12.0,
		}))
		if tiles[0].Sub != "No change vs last year" {
			t.Errorf("ytd sub is %q", tiles[0].Sub)
		}
		// 0.04 points rounds to 0.0 — still no change, not "+0.0 pts".
		if tiles[3].Sub != "No change vs last year" {
			t.Errorf("rate sub is %q", tiles[3].Sub)
		}
	})
}

func TestDashboardMonths(t *testing.T) {
	t.Run("labels each month, marks the last as current, and scales to the tallest", func(t *testing.T) {
		ms := dashboardMonths(months(false))
		if len(ms) != 12 {
			t.Fatalf("%d months", len(ms))
		}
		if ms[0].Label != "Nov" {
			t.Errorf("first label is %q", ms[0].Label)
		}
		if ms[11].LongLabel != "October 2026" {
			t.Errorf("last long label is %q", ms[11].LongLabel)
		}
		for i, m := range ms {
			if m.IsCurrent != (i == 11) {
				t.Errorf("month %d isCurrent=%v", i, m.IsCurrent)
			}
		}
		// The tallest bar leaves headroom; a small one is never invisible; an empty one is flat.
		if ms[6].HeightPct != 93 {
			t.Errorf("tallest bar is %d%%", ms[6].HeightPct)
		}
		if ms[11].HeightPct < 2 {
			t.Errorf("a $40 month is %d%% tall", ms[11].HeightPct)
		}
		if ms[0].HeightPct != 0 {
			t.Errorf("an empty month is %d%% tall", ms[0].HeightPct)
		}
		if ms[6].AmountLabel != "$1,000" {
			t.Errorf("amount is %q", ms[6].AmountLabel)
		}
	})

	t.Run("draws twelve flat bars when nothing arrived", func(t *testing.T) {
		for _, m := range dashboardMonths(months(true)) {
			if m.HeightPct != 0 {
				t.Fatalf("%s is %d%% tall", m.MonthStart, m.HeightPct)
			}
		}
	})
}
