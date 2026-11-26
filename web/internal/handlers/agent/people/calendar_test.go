package people

import (
	"fmt"
	"slices"
	"testing"
)

// Ported from web/lib/agent/calendar.test.ts, case for case.

func ev(date, id, kind string) calEvent {
	return calEvent{ID: id, Kind: kind, Date: date, Label: id}
}

func flat(m calMonth) []calDay {
	var out []calDay
	for _, w := range m.Weeks {
		out = append(out, w...)
	}
	return out
}

func TestMonthArithmetic(t *testing.T) {
	for _, c := range []struct{ y, m, want int }{
		{2026, 2, 28}, {2028, 2, 29}, {2100, 2, 28}, {2026, 4, 30}, {2026, 12, 31},
	} {
		if got := daysInMonth(c.y, c.m); got != c.want {
			t.Errorf("daysInMonth(%d, %d) = %d, want %d", c.y, c.m, got, c.want)
		}
	}
	for _, c := range []struct {
		in    string
		delta int
		want  string
	}{
		{"2026-12", 1, "2027-01"}, {"2026-01", -1, "2025-12"}, {"2026-09", 4, "2027-01"},
	} {
		if got := shiftMonth(c.in, c.delta); got != c.want {
			t.Errorf("shiftMonth(%q, %d) = %q, want %q", c.in, c.delta, got, c.want)
		}
	}
}

func TestValidMonth(t *testing.T) {
	for _, c := range []struct{ raw, fallback, want string }{
		// a month number no month has
		{"2026-00", "2026-09", "2026-09"}, {"2026-13", "2026-09", "2026-09"}, {"2026-99", "2026-09", "2026-09"},
		// a year outside the window
		{"0000-01", "2026-09", "2026-09"}, {"1999-12", "2026-09", "2026-09"}, {"2101-01", "2026-09", "2026-09"},
		// not the shape at all, including absent
		{"", "2026-09", "2026-09"}, {"2026-9", "2026-09", "2026-09"}, {"2026-09-01", "2026-09", "2026-09"},
		{"not-a-month", "2026-09", "2026-09"},
		// a valid value untouched, both window edges included
		{"2026-09", "2026-01", "2026-09"}, {"2000-01", "2026-01", "2000-01"}, {"2100-12", "2026-01", "2100-12"},
	} {
		if got := validMonth(c.raw, c.fallback); got != c.want {
			t.Errorf("validMonth(%q) = %q, want %q", c.raw, got, c.want)
		}
	}
}

func TestNavMonthAgreesWithValidMonth(t *testing.T) {
	for _, c := range []struct {
		in    string
		delta int
		want  string
	}{
		{"2100-12", 1, "2100-12"}, {"2000-01", -1, "2000-01"}, // held at the window's own edges
		{"2026-12", 1, "2027-01"}, {"2026-01", -1, "2025-12"}, {"2100-11", 1, "2100-12"}, {"2000-02", -1, "2000-01"},
		{"1850-03", 1, "1850-04"}, // outside the window, it steps on its own
	} {
		if got := navMonth(c.in, c.delta); got != c.want {
			t.Errorf("navMonth(%q, %d) = %q, want %q", c.in, c.delta, got, c.want)
		}
	}
	if shiftMonth("2100-12", 1) != "2101-01" || shiftMonth("2000-01", -1) != "1999-12" {
		t.Error("shiftMonth should step past the window; only navMonth holds")
	}
	for _, month := range []string{"2000-01", "2000-02", "2026-06", "2100-11", "2100-12"} {
		g := buildMonth(month, "2026-01-01", nil)
		if validMonth(g.PrevMonth, "FALLBACK") != g.PrevMonth || validMonth(g.NextMonth, "FALLBACK") != g.NextMonth {
			t.Errorf("%s: a nav link the guard would refuse (%s, %s)", month, g.PrevMonth, g.NextMonth)
		}
	}
	g := buildMonth("2100-12", "2026-01-01", nil)
	var spill []string
	for _, d := range flat(g) {
		if !d.InMonth && d.Date > "2100-12" {
			spill = append(spill, d.Date)
		}
	}
	if !slices.Equal(spill, []string{"2101-01-01"}) || g.NextMonth != "2100-12" {
		t.Errorf("spill at the window edge = %v, next = %s", spill, g.NextMonth)
	}
}

func TestBuildMonth(t *testing.T) {
	t.Run("uses the real leading offset", func(t *testing.T) {
		if firstWeekday(2026, 9) != 2 {
			t.Fatalf("firstWeekday(2026, 9) = %d", firstWeekday(2026, 9))
		}
		first := buildMonth("2026-09", "2026-09-22", nil).Weeks[0]
		if first[0].InMonth || first[1].InMonth || first[2].Date != "2026-09-01" || !first[2].InMonth {
			t.Errorf("first week = %+v", first)
		}
	})

	t.Run("grows to six rows and shrinks to four", func(t *testing.T) {
		six := buildMonth("2026-05", "2026-05-01", nil)
		if len(six.Weeks) != 6 || len(flat(six)) != 42 {
			t.Errorf("May 2026: %d weeks", len(six.Weeks))
		}
		four := ""
		for y := 2026; y <= 2040 && four == ""; y++ {
			if daysInMonth(y, 2) == 28 && firstWeekday(y, 2) == 0 {
				four = fmt.Sprintf("%d-02", y)
			}
		}
		if four == "" {
			t.Fatal("no four-row February found")
		}
		if g := buildMonth(four, "2026-01-01", nil); len(g.Weeks) != 4 || len(flat(g)) != 28 {
			t.Errorf("%s: %d weeks", four, len(g.Weeks))
		}
	})

	t.Run("always exactly the rows the month needs", func(t *testing.T) {
		for y := 2026; y <= 2029; y++ {
			for m := 1; m <= 12; m++ {
				month := fmt.Sprintf("%d-%02d", y, m)
				want := (firstWeekday(y, m) + daysInMonth(y, m) + 6) / 7
				if got := len(buildMonth(month, "2026-01-01", nil).Weeks); got != want {
					t.Errorf("%s: %d weeks, want %d", month, got, want)
				}
			}
		}
	})

	t.Run("never loses a day of the month", func(t *testing.T) {
		for _, month := range []string{"2026-01", "2026-02", "2026-05", "2026-08", "2028-02", "2026-11"} {
			var in []calDay
			for _, d := range flat(buildMonth(month, "2026-01-01", nil)) {
				if d.InMonth {
					in = append(in, d)
				}
			}
			y, m := splitMonth(month)
			if len(in) != daysInMonth(y, m) || in[0].DayOfMonth != 1 || in[len(in)-1].DayOfMonth != daysInMonth(y, m) {
				t.Errorf("%s: %d in-month days", month, len(in))
			}
		}
	})

	t.Run("puts several events on one day", func(t *testing.T) {
		g := buildMonth("2026-10", "2026-10-01", []calEvent{
			ev("2026-10-01", "departs", "departure"), ev("2026-10-01", "deposit", "payment"), ev("2026-10-05", "returns", "return"),
		})
		for _, d := range flat(g) {
			switch d.Date {
			case "2026-10-01":
				if len(d.Events) != 2 || d.Events[0].ID != "departs" || d.Events[1].ID != "deposit" {
					t.Errorf("Oct 1 events = %+v", d.Events)
				}
			case "2026-10-05":
				if len(d.Events) != 1 {
					t.Errorf("Oct 5 events = %+v", d.Events)
				}
			}
		}
	})

	t.Run("marks exactly one day as today", func(t *testing.T) {
		count := func(g calMonth) (n int, inMonth bool) {
			for _, d := range flat(g) {
				if d.IsToday {
					n++
					inMonth = d.InMonth
				}
			}
			return n, inMonth
		}
		if n, _ := count(buildMonth("2026-09", "2026-09-22", nil)); n != 1 {
			t.Errorf("today marked %d times", n)
		}
		if n, _ := count(buildMonth("2027-03", "2026-09-22", nil)); n != 0 {
			t.Errorf("today elsewhere marked %d times", n)
		}
		// a spill-over cell is today only when its own date is
		if n, in := count(buildMonth("2026-09", "2026-10-01", nil)); n != 1 || in {
			t.Errorf("spill-over today: n=%d inMonth=%v", n, in)
		}
	})

	t.Run("the agenda holds only this month, in date order", func(t *testing.T) {
		g := buildMonth("2026-10", "2026-10-01", []calEvent{
			ev("2026-11-02", "next month", "departure"), ev("2026-10-20", "later", "departure"),
			ev("2026-09-30", "last month", "departure"), ev("2026-10-03", "earlier", "departure"),
		})
		var ids []string
		for _, e := range g.Agenda {
			ids = append(ids, e.ID)
		}
		if !slices.Equal(ids, []string{"earlier", "later"}) {
			t.Errorf("agenda = %v", ids)
		}
	})

	t.Run("labels the month and names its neighbours", func(t *testing.T) {
		g := buildMonth("2026-12", "2026-12-01", nil)
		if g.MonthLabel != "December 2026" || g.PrevMonth != "2026-11" || g.NextMonth != "2027-01" {
			t.Errorf("got %q %q %q", g.MonthLabel, g.PrevMonth, g.NextMonth)
		}
	})
}
