package money

import (
	"net/url"
	"testing"
	"time"
)

// §3.7.7's view model, a port of web/lib/agent/forecast.test.ts and forecastWeights.test.ts.
//
// What it pins:
//  1. The caption repeats the worklist tile's own figure (unweighted total, confidence), so
//     the two screens are seen to agree; the confidence is ABSENT, not 0%, on an empty
//     pipeline.
//  2. The calendar always shows twelve months; overdue, later and undated only when they hold
//     money; the year only where it turns.

func stage(status string, weight, trips int, raw, weighted Cents) forecastRow {
	return forecastRow{
		Status: status, WeightPct: weight, TripCount: trips,
		RawCents: raw, WeightedCents: weighted,
		TotalRawCents: 1110076, TotalWeightedCents: 937516,
	}
}

func testStages() []forecastRow {
	return []forecastRow{
		stage("inquiry", 20, 2, 0, 0),
		stage("proposal", 50, 3, 345120, 172560),
		stage("booked", 100, 5, 675196, 675196),
		stage("in_progress", 100, 1, 89760, 89760),
	}
}

// testCalendar is the accessor's shape: overdue, twelve months, later, undated.
func testCalendar(overdue, later, undated, received Cents) []cashInRow {
	amounts := []Cents{0, 0, 151200, 168756, 147400, 0, 57840, 114720, 0, 297600, 0, 0}
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	rows := []cashInRow{{Bucket: "overdue", Cents: overdue, ReceivedCents: received}}
	for i, a := range amounts {
		m := start.AddDate(0, i, 0).Format(time.DateOnly)
		rows = append(rows, cashInRow{Bucket: "month", MonthStart: &m, Cents: a, ReceivedCents: received})
	}
	rows = append(rows,
		cashInRow{Bucket: "later", Cents: later, ReceivedCents: received},
		cashInRow{Bucket: "undated", Cents: undated, ReceivedCents: received})
	return rows
}

func TestForecastView(t *testing.T) {
	t.Run("leads with the weighted total and the worklist tile's own figure", func(t *testing.T) {
		v := forecastView(testStages(), testCalendar(0, 0, 0, 0))
		if v.TotalLabel != "$9,375" {
			t.Errorf("total is %q", v.TotalLabel)
		}
		if v.AcrossLabel != "Of $11,101 across 11 open trips · 84% confidence" {
			t.Errorf("caption is %q", v.AcrossLabel)
		}
		want := [][3]string{
			{"Inquiry", "20", "$0"},
			{"Proposal", "50", "$1,726"},
			{"Booked", "100", "$6,752"},
			{"Traveling", "100", "$898"},
		}
		if len(v.Stages) != len(want) {
			t.Fatalf("%d stages", len(v.Stages))
		}
		for i, w := range want {
			s := v.Stages[i]
			if s.Label != w[0] || itoa(s.WeightPct) != w[1] || s.WeightedLabel != w[2] {
				t.Errorf("stage %d is %q %d %q, want %v", i, s.Label, s.WeightPct, s.WeightedLabel, w)
			}
		}
		if v.Stages[1].TripCountLabel != "3 trips" || v.Stages[3].TripCountLabel != "1 trip" {
			t.Errorf("trip counts are %q and %q", v.Stages[1].TripCountLabel, v.Stages[3].TripCountLabel)
		}
	})

	t.Run("an empty pipeline has no confidence to report, not 0%", func(t *testing.T) {
		var empty []forecastRow
		for _, s := range testStages() {
			s.RawCents, s.WeightedCents, s.TripCount = 0, 0, 0
			s.TotalRawCents, s.TotalWeightedCents = 0, 0
			empty = append(empty, s)
		}
		v := forecastView(empty, testCalendar(0, 0, 0, 0))
		// No caption at all: "Of $0 across 0 open trips" says nothing.
		if v.AcrossLabel != "" {
			t.Errorf("caption is %q", v.AcrossLabel)
		}
		if v.AnyCommission {
			t.Error("an empty pipeline reads as having commission")
		}
	})

	t.Run("shows twelve months always, with the year only where it turns", func(t *testing.T) {
		v := forecastView(testStages(), testCalendar(0, 0, 0, 0))
		if len(v.Calendar) != 12 {
			t.Fatalf("%d rows", len(v.Calendar))
		}
		want := []string{"Oct 2026", "Nov", "Dec", "Jan 2027", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"}
		for i, w := range want {
			if v.Calendar[i].Label != w {
				t.Errorf("row %d is %q, want %q", i, v.Calendar[i].Label, w)
			}
		}
		// Against the largest row: July's $2,976 is the full bar.
		if v.Calendar[9].BarPct != 100 || v.Calendar[0].BarPct != 0 {
			t.Errorf("bars are %d and %d", v.Calendar[9].BarPct, v.Calendar[0].BarPct)
		}
	})

	t.Run("overdue first, later and undated last, only when they hold money", func(t *testing.T) {
		v := forecastView(testStages(), testCalendar(20000, 0, 40000, 20000))
		first, last := v.Calendar[0], v.Calendar[len(v.Calendar)-1]
		if first.Kind != "overdue" || first.Label != "Overdue" || first.AmountLabel != "$200" {
			t.Errorf("first row is %+v", first)
		}
		if last.Kind != "undated" || last.Label != "No travel dates yet" || last.AmountLabel != "$400" {
			t.Errorf("last row is %+v", last)
		}
		for _, r := range v.Calendar {
			if r.Kind == "later" {
				t.Error("an empty 'later' was drawn")
			}
		}
		if v.ReceivedNote != "$200 of the forecast is already received, so the calendar leaves it out." {
			t.Errorf("received note is %q", v.ReceivedNote)
		}
	})

	t.Run("drops a bucket it does not know, and gives any money a visible sliver", func(t *testing.T) {
		rows := testCalendar(0, 0, 0, 0)
		rows[3].Cents = 500 // $5 beside July's $2,976
		rows = append(rows, cashInRow{Bucket: "someday", Cents: 999})
		v := forecastView(testStages(), rows)
		if len(v.Calendar) != 12 {
			t.Fatalf("%d rows", len(v.Calendar))
		}
		if v.Calendar[2].BarPct != 2 {
			t.Errorf("the smallest bar is %d%%", v.Calendar[2].BarPct)
		}
	})
}

func TestParseWeight(t *testing.T) {
	for _, c := range []struct {
		in   string
		want int
		ok   bool
	}{
		{"0", 0, true},
		{"50", 50, true},
		{"100", 100, true},
		{" 75 ", 75, true},
		{"75%", 75, true},
		{"101", 0, false},
		{"7.5", 0, false},
		{"", 0, false},
		{"-5", 0, false},
		{"abc", 0, false},
	} {
		got, ok := parseWeight(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("parseWeight(%q) = %d, %v; want %d, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestWeightsFromForm(t *testing.T) {
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "40")
	}
	weights, expected, ok := weightsFromForm(form)
	if !ok {
		t.Fatal("a complete form was refused")
	}
	if len(weights) != 4 || weights["booked"] != 50 || expected["booked"] != 40 {
		t.Fatalf("read %v / %v", weights, expected)
	}
	// One bad field refuses the whole save: a partial set would write three of four weights.
	form.Set("weight-booked", "120")
	if _, _, ok := weightsFromForm(form); ok {
		t.Error("a weight over 100 was accepted")
	}
	// A missing stage is refused too, rather than defaulting to zero.
	form.Set("weight-booked", "50")
	form.Del("weight-in_progress")
	if _, _, ok := weightsFromForm(form); ok {
		t.Error("a missing stage was accepted")
	}
}
