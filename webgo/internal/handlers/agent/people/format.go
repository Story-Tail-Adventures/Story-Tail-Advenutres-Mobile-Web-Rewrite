package people

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Formatting for the agent screens, ported from web/lib/agent/queries.ts, lib/trips/money.ts
// and lib/public/money.ts. Every date and amount is formatted here, on the server, in the
// advisor's own time zone: queries.ts's rule 2. A date is a "YYYY-MM-DD" string already in the
// advisor's zone (the accessors compute as_of_date in agent.time_zone); an INSTANT
// (timestamptz) arrives in UTC and must go through localDate before it can be labelled.

// Cents is a money column from an agent read. The accessors cast bigint to text (PostgREST
// would otherwise send a JSON number and lose precision past 2^53), so it arrives as a
// digit-string; a plain number is accepted too. null and "" are 0, as cents() did. CLAUDE.md
// rule 5: it is int64 all the way, never a float.
type Cents int64

// UnmarshalJSON reads "1250000", 1250000 or null.
func (c *Cents) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if bytes.Equal(b, []byte("null")) {
		*c = 0
		return nil
	}
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		b = []byte(strings.TrimSpace(s))
		if len(b) == 0 {
			*c = 0
			return nil
		}
	}
	n, err := strconv.ParseInt(string(b), 10, 64)
	if err != nil {
		// cents(): a value that is not a finite number is 0, never NaN on the screen.
		*c = 0 // a bad amount reads as zero, as cents() did
		return nil
	}
	*c = Cents(n)
	return nil
}

// formatMoney ports formatTripMoney + formatMoney: en-US currency, whole dollars when whole is
// set or the amount has no cents, else two places. formatTripMoney knows only USD (Story-Tail
// quotes in USD; docs/BRD.md), and formats anything else as USD, so the symbol is always $.
// Rounding is Intl's halfExpand (half away from zero).
func formatMoney(amount Cents, whole bool) string {
	neg := amount < 0
	n := int64(amount)
	if neg {
		n = -n
	}
	dollars, rem := n/100, n%100
	var frac string
	if whole || rem == 0 {
		if rem >= 50 {
			dollars++
		}
	} else {
		frac = fmt.Sprintf(".%02d", rem)
	}
	out := "$" + groupThousands(dollars) + frac
	if neg {
		out = "-" + out
	}
	return out
}

func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	head := len(s) % 3
	if head > 0 {
		b.WriteString(s[:head])
	}
	for i := head; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

// money is queries.ts money(): whole dollars. The row's currency is not passed: whatever it
// names (or null), the amount formats as USD (formatMoney).
func money(amount Cents) string { return formatMoney(amount, true) }

func parseDay(iso string) (time.Time, bool) {
	t, err := time.Parse(time.DateOnly, iso)
	return t, err == nil
}

// daysFrom is the whole days from one ISO date to another, both already in the agent's zone.
func daysFrom(todayISO, thenISO string) int {
	a, ok1 := parseDay(todayISO)
	b, ok2 := parseDay(thenISO)
	if !ok1 || !ok2 {
		return 0
	}
	return int(b.Sub(a).Hours() / 24)
}

// relativeDay ports relativeDay: "Today", "Tomorrow", "3 days", "2 days late". "" for no date.
func relativeDay(todayISO, thenISO string) string {
	if thenISO == "" {
		return ""
	}
	d := daysFrom(todayISO, thenISO)
	switch {
	case d == 0:
		return "Today"
	case d == 1:
		return "Tomorrow"
	case d < 0:
		late := -d
		if late == 1 {
			return "1 day late"
		}
		return fmt.Sprintf("%d days late", late)
	}
	return fmt.Sprintf("%d days", d)
}

var shortMonths = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

// monthDay ports monthDay: "2026-09-21" -> "Sep 21" (the day keeps its leading zero, as the
// split did: "Sep 05"). "" for no date.
func monthDay(iso string) string {
	if iso == "" {
		return ""
	}
	parts := strings.Split(iso, "-")
	if len(parts) < 3 {
		return ""
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 1 || m > 12 {
		return ""
	}
	return shortMonths[m-1] + " " + parts[2]
}

// parseInstant reads a timestamptz as PostgREST writes it ("2026-09-22T00:30:00+00:00",
// fractional seconds or a Z allowed).
func parseInstant(ts string) (time.Time, bool) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999Z0700", "2006-01-02 15:04:05.999999999Z07:00", "2006-01-02 15:04:05.999999999Z07"} {
		if t, err := time.Parse(layout, ts); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// localDate ports localDate: the calendar date an instant falls on in the agent's zone. An
// unrecognised zone falls back to the UTC date rather than failing; not a timestamp is "".
func localDate(ts, zone string) string {
	at, ok := parseInstant(ts)
	if !ok {
		return ""
	}
	loc, ok := loadZone(zone)
	if !ok {
		if len(ts) >= 10 {
			return ts[:10]
		}
		return ""
	}
	return at.In(loc).Format(time.DateOnly)
}

// waitingLabel ports waitingLabel: "Arrived today", "Waiting 1 day", "Waiting 4 days". Never
// a colour or an alarm. "" when there is nothing to count from.
func waitingLabel(todayISO, since, zone string) string {
	if since == "" {
		return ""
	}
	day := localDate(since, zone)
	if day == "" {
		return ""
	}
	d := max(0, daysFrom(day, todayISO))
	switch d {
	case 0:
		return "Arrived today"
	case 1:
		return "Waiting 1 day"
	}
	return fmt.Sprintf("Waiting %d days", d)
}

// partOfDayIn ports partOfDayIn: the greeting's word from the hour in the agent's zone, never
// the server's. An unrecognised zone uses the UTC hour.
func partOfDayIn(zone string, now time.Time) string {
	hour := now.UTC().Hour()
	if loc, ok := loadZone(zone); ok {
		hour = now.In(loc).Hour()
	}
	switch {
	case hour < 12:
		return "Morning"
	case hour < 18:
		return "Afternoon"
	}
	return "Evening"
}

// zones caches time.LoadLocation by name: a page formats a date per row, and loading reads
// the zone data each time. A *time.Location is immutable, so sharing one is safe.
var zones sync.Map // string -> *time.Location (nil for a name that does not load)

// loadZone is time.LoadLocation, cached. "Local" is refused: Intl has no such zone, so Next
// fell back to UTC there, and the server's own zone must never leak into a label.
func loadZone(name string) (*time.Location, bool) {
	if name == "" || name == "Local" {
		return nil, false
	}
	if v, ok := zones.Load(name); ok {
		loc, _ := v.(*time.Location)
		return loc, loc != nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		loc = nil
	}
	zones.Store(name, loc)
	return loc, loc != nil
}

// jsNumber writes a non-money number the way a JavaScript template literal does: 12 for 12.0,
// 12.5 for 12.5.
func jsNumber(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

// plural picks the word for n, the way every count in the copy does.
func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
