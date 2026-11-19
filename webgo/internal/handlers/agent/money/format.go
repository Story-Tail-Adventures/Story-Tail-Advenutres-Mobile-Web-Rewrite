package money

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

// Formatting for the money screens, ported from web/lib/agent/queries.ts, lib/agent/commission.ts,
// lib/agent/payments.ts and lib/trips/money.ts. Every amount and date is formatted here, on the
// server, in the advisor's own time zone: queries.ts's rule 2. A date is a "YYYY-MM-DD" string
// already in the advisor's zone (the accessors compute as_of_date in agent.time_zone); an
// INSTANT (timestamptz) arrives in UTC and must go through localDate before it can be labelled.

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
		*c = 0
		return nil
	}
	*c = Cents(n)
	return nil
}

// Rate is a `numeric` column (commission_pct, avg_rate_pct). PostgREST sends numeric as a
// JSON number, but a view or a future cast could send a string, and Number(null) is 0 —
// which on a rate tile is a claim. So null stays null here too: Set reports whether there
// is a figure at all (commission.ts's rate()).
type Rate struct {
	Value float64
	Set   bool
}

// UnmarshalJSON reads 12.5, "12.50", "" or null.
func (r *Rate) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if bytes.Equal(b, []byte("null")) {
		*r = Rate{}
		return nil
	}
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			*r = Rate{}
			return nil
		}
		b = []byte(s)
	}
	f, err := strconv.ParseFloat(string(b), 64)
	if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
		*r = Rate{} // not a finite number is no rate, never 0%
		return nil
	}
	*r = Rate{Value: f, Set: true}
	return nil
}

// jsRound is JavaScript's Math.round: half UP (toward +∞), not Go's half away from zero.
// −0.5 rounds to 0 in JS and to −1 with math.Round, which would turn "no change" into "−1%".
func jsRound(f float64) float64 { return math.Floor(f + 0.5) }

// percentChange is commission.ts's: a whole-number percent, or no answer when there is no
// base to change from (before <= 0). "+∞%" is not a figure anybody can act on.
func percentChange(now, before Cents) (int, bool) {
	if before <= 0 {
		return 0, false
	}
	return int(jsRound((float64(now) - float64(before)) / float64(before) * 100)), true
}

// toFixed is JavaScript's Number.prototype.toFixed, which rounds a tie to the LARGER value
// (ECMA-262: "if there are two such n, pick the larger n"), where Go's strconv rounds a tie
// to even. 12.25 is "12.3" in a browser and would be "12.2" from FormatFloat, so the rate
// tile's "+0.3 pts" would read "+0.2 pts". The decision is made on the double's own decimal
// expansion, so a value that only looks like a tie (8.45 is really 8.4499999999999993)
// rounds down, exactly as the browser does.
func toFixed(x float64, places int) string {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	neg := math.Signbit(x)
	if neg {
		x = -x
	}
	// 30 places is past the point where two doubles of this size can differ, so the digits
	// after the cut decide the comparison with the midpoint exactly.
	exact := strconv.FormatFloat(x, 'f', 30, 64)
	intPart, frac, _ := strings.Cut(exact, ".")
	digits := []byte(intPart + frac[:places])
	rest := frac[places:]
	if roundsUp(rest) {
		digits = bumpLast(digits)
	}
	out := string(digits)
	if places > 0 {
		cut := len(out) - places
		out = out[:cut] + "." + out[cut:]
	}
	out = strings.TrimLeft(out, "0")
	if out == "" || out[0] == '.' {
		out = "0" + out
	}
	if neg && strings.Trim(out, "0.") != "" {
		out = "-" + out
	}
	return out
}

// roundsUp reports whether the digits past the cut are >= one half (a tie goes up).
func roundsUp(rest string) bool {
	if rest == "" {
		return false
	}
	if rest[0] != '5' {
		return rest[0] > '5'
	}
	return true // "5" exactly is the tie, and the tie goes up
}

// bumpLast adds one to a decimal digit string, growing it on a carry out of the top.
func bumpLast(d []byte) []byte {
	for i := len(d) - 1; i >= 0; i-- {
		if d[i] < '9' {
			d[i]++
			return d
		}
		d[i] = '0'
	}
	return append([]byte{'1'}, d...)
}

// formatMoney ports formatTripMoney + formatMoney: en-US currency, whole dollars when whole
// is set or the amount has no cents, else two places. formatTripMoney knows only USD
// (Story-Tail quotes in USD; docs/BRD.md) and formats anything else as USD, so the symbol is
// always $. Rounding is Intl's halfExpand (half away from zero).
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
// names (or null), the amount formats as USD (formatTripMoney's KNOWN list).
func money(amount Cents) string { return formatMoney(amount, true) }

// moneyExact is formatTripMoney with no `whole`: to the cent. §3.7.3 records what arrived.
func moneyExact(amount Cents) string { return formatMoney(amount, false) }

// centsToDollars ports payments.ts centsToDollars: the form's starting value, "11400.00".
func centsToDollars(amount Cents) string {
	neg := amount < 0
	n := int64(amount)
	if neg {
		n = -n
	}
	out := fmt.Sprintf("%d.%02d", n/100, n%100)
	if neg {
		out = "-" + out
	}
	return out
}

// rateLabel ports commission.ts rateLabel: Intl's en-US number with at most two decimals,
// so "12%", "12.5%", "13.75%". A rate is stored to two places; trailing zeros say nothing.
func rateLabel(pct float64) string {
	v := toFixed(math.Abs(pct), 2)
	whole, frac, _ := strings.Cut(v, ".")
	frac = strings.TrimRight(frac, "0")
	n, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		n = 0
	}
	out := groupThousands(n)
	if frac != "" {
		out += "." + frac
	}
	if math.Signbit(pct) && strings.Trim(out, "0.,") != "" {
		out = "-" + out
	}
	return out + "%"
}

func parseDay(iso string) (time.Time, bool) {
	t, err := time.Parse(time.DateOnly, iso)
	return t, err == nil
}

var shortMonths = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

var longMonths = [...]string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

// travelDateLabel ports commission.ts travelDateLabel: "Aug 12, 2026" from a date-only ISO
// string, read at noon UTC — the value is a calendar date with no time in it, so there is no
// zone for it to be wrong in, and noon keeps it off either side of midnight. "" for no date,
// and for anything that is not one (Next builds `${iso}T12:00:00Z`, which is an Invalid Date
// for anything else).
func travelDateLabel(iso string) string {
	if iso == "" {
		return ""
	}
	d, ok := parseDay(iso)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%s %d, %d", shortMonths[d.Month()-1], d.Day(), d.Year())
}

// monthShort and monthLong port commission.ts monthLabel: "Jun" under a bar, "June 2026" in
// the screen-reader table and the bar's title.
func monthShort(iso string) string {
	d, ok := parseDay(iso)
	if !ok {
		return ""
	}
	return shortMonths[d.Month()-1]
}

func monthLong(iso string) string {
	d, ok := parseDay(iso)
	if !ok {
		return ""
	}
	return fmt.Sprintf("%s %d", longMonths[d.Month()-1], d.Year())
}

// plural picks the word for n, the way every count in the copy does.
func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}
