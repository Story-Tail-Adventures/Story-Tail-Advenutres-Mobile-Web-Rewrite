package validate

import "time"

// Dates on the traveler's screens are date-only columns: a birthday, a passport expiry, a
// trip's start. They are compared as strings, never as instants, because a `date` has no
// time zone and turning one into a time.Time to compare it reintroduces the question of
// whose midnight it is (the §3.11 "untyped literal AT TIME ZONE" trap, from the other side).

// isoDateLayout is the YYYY-MM-DD a date column takes.
const isoDateLayout = "2006-01-02"

// IsRealDate reports whether value is a real calendar date, not merely a well-shaped one:
// 2026-02-30 passes the shape and does not exist (isRealDate in web/lib/validation/profile.ts).
func IsRealDate(value string) bool {
	if len(value) != len(isoDateLayout) {
		return false
	}
	t, err := time.Parse(isoDateLayout, value)
	if err != nil {
		return false
	}
	// A day that rolled over (31 February) formats back as a different string, which is what
	// makes this exact rather than merely well-shaped.
	return t.Format(isoDateLayout) == value
}

// TodayISO is today in UTC, for comparing against a date-only column (todayIso).
//
// The browser and the server can in principle disagree, but only across the instant of UTC
// midnight and only about the `max` on a date input and whether a passport shows as expired.
// Neither blocks a save and neither is stored, so Next accepted that and so does this.
func TodayISO(now time.Time) string { return now.UTC().Format(isoDateLayout) }

// earliestBirthDate is the oldest date of birth accepted. NOT an age check: Data-Model §6.1
// has no minimum age and there must not be one — clients travel with minors on their own
// accounts, and Gyasi creates records for whole households. This only catches the year
// somebody's finger slipped on.
const earliestBirthDate = "1900-01-01"
