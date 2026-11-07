package trips

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Formatting shared by every trips screen, ported from web/lib/public/money.ts
// (formatMoney), lib/trips/money.ts (formatTripMoney), lib/trips/status.ts
// (tripStatusPresentation) and lib/agent/queries.ts (cents, money, relativeDay, monthDay).
// Everything is plain strings out, computed here so the page only places text.

// Cents is a money column as the agent read model sends it: a digit-string, because
// PostgREST serialises bigint as a JSON number and loses precision past 2^53 (api.ts). A
// plain JSON integer is read too, and null or "" is zero, as cents() in queries.ts treats
// them. A fraction or anything else is refused: money is int64 cents end to end
// (CLAUDE.md rule 5), so a value that is not whole cents is a defect to surface, not round.
type Cents int64

// UnmarshalJSON reads "123", 123, null or "".
func (c *Cents) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if bytes.Equal(b, []byte("null")) {
		*c = 0
		return nil
	}
	s := string(b)
	if len(b) >= 2 && b[0] == '"' {
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		if s == "" {
			*c = 0
			return nil
		}
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return fmt.Errorf("trips: %q is not whole cents", s)
	}
	*c = Cents(n)
	return nil
}

// formatMoney ports formatMoney through formatTripMoney: en-US, USD (the only currency the
// business uses, so an unknown code formats as USD as formatTripMoney does), no cents when
// there are none or when whole is asked for, rounding half away from zero as Intl does.
//
// The Next function throws on a negative amount, which would 500 the page; here a negative
// reads "-$1,851", as Intl would write it.
func formatMoney(cents int64, whole bool) string {
	neg := cents < 0
	abs := cents
	if neg {
		abs = -cents
	}
	dollars, rest := abs/100, abs%100
	var b strings.Builder
	if neg {
		b.WriteByte('-')
	}
	b.WriteByte('$')
	if whole || rest == 0 {
		if rest >= 50 {
			dollars++
		}
		b.WriteString(groupThousands(dollars))
		return b.String()
	}
	b.WriteString(groupThousands(dollars))
	fmt.Fprintf(&b, ".%02d", rest)
	return b.String()
}

// money is queries.ts money(): whole dollars.
func money(c Cents) string { return formatMoney(int64(c), true) }

func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	lead := len(s) % 3
	if lead > 0 {
		b.WriteString(s[:lead])
	}
	for i := lead; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

// parseDay reads an ISO yyyy-mm-dd as UTC midnight, as Date.parse("...T00:00:00Z") does.
func parseDay(iso string) (time.Time, bool) {
	if len(iso) < 10 {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02", iso[:10])
	return t, err == nil
}

// daysBetween ports status.ts daysBetween: whole days from from to to, negative when to is in
// the past. ok is false for an unparseable date (Next's NaN).
func daysBetween(from, to string) (int, bool) {
	a, ok1 := parseDay(from)
	b, ok2 := parseDay(to)
	if !ok1 || !ok2 {
		return 0, false
	}
	return int(b.Sub(a).Round(24*time.Hour) / (24 * time.Hour)), true
}

// dueSoonDays is DUE_SOON_DAYS: how close an unpaid milestone makes a booked trip "Final
// payment due" (inclusive; an overdue one counts too).
const dueSoonDays = 14

// The labels (TRIP_STATUS_MESSAGES), word for word; check_copy_parity.py pins the Kotlin twin.
const (
	labelInquiry         = "Inquiry"
	labelProposalReady   = "Proposal ready"
	labelBooked          = "Booked"
	labelFinalPaymentDue = "Final payment due"
	labelTravelingNow    = "Traveling now"
	labelPastTrip        = "Past trip"
	labelCancelled       = "Cancelled"
)

// statusPresentation ports tripStatusPresentation: the chip class suffix
// (.status-<chip>) and the label. nextUnpaidDue is "" when there is none. cancelled is
// checked before the payment override, so a cancelled trip is never "Final payment due".
// A status the enum does not have reads as an inquiry rather than an empty chip.
func statusPresentation(status, nextUnpaidDue, today string) (chip, label string) {
	switch status {
	case "cancelled":
		return "cancelled", labelCancelled
	case "completed":
		return "past", labelPastTrip
	case "in_progress":
		return "traveling", labelTravelingNow
	case "proposal":
		return "proposal", labelProposalReady
	case "booked":
		if nextUnpaidDue != "" {
			if d, ok := daysBetween(today, nextUnpaidDue); ok && d <= dueSoonDays {
				return "due", labelFinalPaymentDue
			}
		}
		return "booked", labelBooked
	}
	return "inquiry", labelInquiry
}

// relativeDay ports queries.ts relativeDay: "Today", "Tomorrow", "3 days late", "10 days".
// "" when then is empty.
func relativeDay(today, then string) string {
	if then == "" {
		return ""
	}
	d, ok := daysBetween(today, then)
	if !ok {
		return ""
	}
	switch {
	case d == 0:
		return "Today"
	case d == 1:
		return "Tomorrow"
	case d < 0:
		n := -d
		if n == 1 {
			return "1 day late"
		}
		return strconv.Itoa(n) + " days late"
	}
	return strconv.Itoa(d) + " days"
}

var monthShort = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

// monthDay ports queries.ts monthDay, which splits the ISO string: "Sep 07", leading zero
// kept. "" for an empty or malformed date.
func monthDay(iso string) string {
	parts := strings.Split(iso, "-")
	if len(parts) < 3 {
		return ""
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil || m < 1 || m > 12 {
		return ""
	}
	return monthShort[m-1] + " " + parts[2]
}

// dayIn is a civil date as Intl formats it in loc when given `${iso}T12:00:00Z`, the way
// trips.ts travelLabel reads a date column.
func dayIn(iso string, loc *time.Location) (time.Time, bool) {
	t, ok := parseDay(iso)
	if !ok {
		return time.Time{}, false
	}
	return t.Add(12 * time.Hour).In(loc), true
}

// travelLabel ports trips.ts travelLabel: "Aug 12 – 19, 2026", "Aug 28 – Sep 4, 2026",
// "Dec 28, 2026 – Jan 4, 2027", or "Aug 12, 2026" with no end. "" with no start.
func travelLabel(start, end string, loc *time.Location) string {
	s, ok := dayIn(start, loc)
	if !ok {
		return ""
	}
	startText := s.Format("Jan 2")
	if end == "" {
		return fmt.Sprintf("%s, %d", startText, s.Year())
	}
	e, ok := dayIn(end, loc)
	if !ok {
		return fmt.Sprintf("%s, %d", startText, s.Year())
	}
	endText := e.Format("Jan 2")
	if s.Year() != e.Year() {
		return fmt.Sprintf("%s, %d – %s, %d", startText, s.Year(), endText, e.Year())
	}
	if s.Month() == e.Month() {
		return fmt.Sprintf("%s – %d, %d", startText, e.Day(), e.Year())
	}
	return fmt.Sprintf("%s – %s, %d", startText, endText, e.Year())
}

// filler is the part of *page.Doc and *page.Row the shared fills use.
type filler interface {
	Text(slot, text string)
	Class(slot, class string, on bool)
}

// setStatusChip draws a StatusChip (.status-chip .status-<chip>) on slot. Each class is
// written out so internal/static's class check can see it.
func setStatusChip(f filler, slot, chip, label string) {
	f.Class(slot, "status-inquiry", chip == "inquiry")
	f.Class(slot, "status-proposal", chip == "proposal")
	f.Class(slot, "status-booked", chip == "booked")
	f.Class(slot, "status-due", chip == "due")
	f.Class(slot, "status-traveling", chip == "traveling")
	f.Class(slot, "status-past", chip == "past")
	f.Class(slot, "status-cancelled", chip == "cancelled")
	f.Class(slot, "status-lead", chip == "lead")
	f.Text(slot, label)
}
