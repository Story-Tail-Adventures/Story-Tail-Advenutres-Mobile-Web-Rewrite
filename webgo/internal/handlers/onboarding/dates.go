package onboarding

import (
	"strconv"
	"time"
)

// The two date formats these screens show, as Intl.DateTimeFormat("en-GB", …) writes them in
// Next: "3 September 1989" and "Sept 2031".
//
// The month names are written out rather than taken from Go's own, because the two
// disagree in one place that matters: en-GB's short September is "Sept", and Go's is "Sep".
// A date rendered one way here and the other way in the Next app would show up as a
// difference in the parity pass and be chased as a bug.
//
// Every value is a date-only column, read and shown in UTC, never converted to a local
// zone: a birthday is the same day everywhere.

var longMonths = [...]string{
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
}

var shortMonths = [...]string{
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
}

// longDate is "3 September 1989". An unparseable value comes back as it was, which is what
// a page would rather show than an empty gap.
func longDate(iso string) string {
	t, ok := parseISO(iso)
	if !ok {
		return iso
	}
	return strconv.Itoa(t.Day()) + " " + longMonths[int(t.Month())-1] + " " + strconv.Itoa(t.Year())
}

// shortDate is "3 Apr 2027" (TRIP_DATE: day numeric, month short, year numeric).
func shortDate(iso string) string {
	t, ok := parseISO(iso)
	if !ok {
		return iso
	}
	return strconv.Itoa(t.Day()) + " " + shortMonths[int(t.Month())-1] + " " + strconv.Itoa(t.Year())
}

// monthYear is "Sept 2031".
func monthYear(iso string) string {
	t, ok := parseISO(iso)
	if !ok {
		return iso
	}
	return shortMonths[int(t.Month())-1] + " " + strconv.Itoa(t.Year())
}

func parseISO(iso string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", iso)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
