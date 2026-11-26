package search

import (
	"regexp"
	"strconv"
	"sync"
	"time"
)

// Calendar dates for the public search surface (Screen Inventory 2.0.3 / 2.0.4). Ports
// web/lib/public/dates.ts. P2.
//
// Everything here is a plain YYYY-MM-DD string. A stay is a pair of calendar days, the
// same to a traveler in Orlando and one in Auckland, so a time.Time appears only inside the
// arithmetic, pinned to UTC noon so no offset can move a day.
//
// THE TIME ZONE IS ALWAYS EXPLICIT. The server formats, so its own zone is nobody's day.
// Every function that needs "today" takes the zone and passes it through.

// isoShape is YYYY-MM-DD, shape only; IsValidISODate also checks the calendar.
var isoShape = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)

// dateUTC is JavaScript's Date.UTC(year, month0, day, hour) as a time. Like Date.UTC it
// reads a year from 0 to 99 as 1900 to 1999, which is why "0050-01-01" is not a valid date
// on the TypeScript side either. Months and days out of range roll over, as they do there.
func dateUTC(year, month0, day, hour int) time.Time {
	if year >= 0 && year <= 99 {
		year += 1900
	}
	return time.Date(year, time.Month(month0+1), day, hour, 0, 0, 0, time.UTC)
}

// isoParts splits a string of isoShape into its numbers.
func isoParts(s string) (y, m, d int) {
	y, _ = strconv.Atoi(s[0:4])
	m, _ = strconv.Atoi(s[5:7])
	d, _ = strconv.Atoi(s[8:10])
	return y, m, d
}

// IsValidISODate reports whether value is a real calendar date in YYYY-MM-DD.
//
// The round trip is the point: 2026-02-30 rolls over into March, so the shape alone accepts
// days that do not exist. Re-deriving the parts and comparing catches it.
func IsValidISODate(value string) bool {
	if !isoShape.MatchString(value) {
		return false
	}
	y, m, d := isoParts(value)
	if m < 1 || m > 12 || d < 1 || d > 31 {
		return false
	}
	t := dateUTC(y, m-1, d, 12)
	return t.Year() == y && int(t.Month()) == m && t.Day() == d
}

// ParseISODate is a YYYY-MM-DD date at UTC noon, or false when it is not a real date.
func ParseISODate(value string) (time.Time, bool) {
	if !IsValidISODate(value) {
		return time.Time{}, false
	}
	y, m, d := isoParts(value)
	return dateUTC(y, m-1, d, 12), true
}

// ToISODate writes the UTC calendar day of t as YYYY-MM-DD.
func ToISODate(t time.Time) string {
	t = t.UTC()
	return padStart(strconv.Itoa(t.Year()), 4) + "-" + padStart(strconv.Itoa(int(t.Month())), 2) +
		"-" + padStart(strconv.Itoa(t.Day()), 2)
}

var zones sync.Map // name -> *time.Location

// zone loads a time zone once. The zone database is embedded (doc.go), so this works in an
// image with no zone files.
func zone(name string) (*time.Location, error) {
	if loc, ok := zones.Load(name); ok {
		return loc.(*time.Location), nil
	}
	loc, err := time.LoadLocation(name)
	if err != nil {
		return nil, err
	}
	zones.Store(name, loc)
	return loc, nil
}

// TodayISO is the calendar day it is at now in timeZone, as YYYY-MM-DD. An unknown zone is
// an error, where Intl threw.
func TodayISO(timeZone string, now time.Time) (string, error) {
	loc, err := zone(timeZone)
	if err != nil {
		return "", err
	}
	return now.In(loc).Format("2006-01-02"), nil
}

// AddDays is iso moved by days, or false when iso is not a real date.
func AddDays(iso string, days int) (string, bool) {
	t, ok := ParseISODate(iso)
	if !ok {
		return "", false
	}
	return ToISODate(t.AddDate(0, 0, days)), true
}

// NightsBetween is the whole nights from checkIn to checkOut, negative when they are the
// wrong way round, or false when either is not a real date.
func NightsBetween(checkIn, checkOut string) (int, bool) {
	a, okA := ParseISODate(checkIn)
	b, okB := ParseISODate(checkOut)
	if !okA || !okB {
		return 0, false
	}
	// Both are UTC noon, so the difference is whole days. Unix seconds rather than Sub:
	// a time.Duration overflows at 292 years, and the years run from 100 to 9999.
	return int((b.Unix() - a.Unix()) / 86400), true
}

// shortMonths and longMonths are Intl's en-US month names.
var shortMonths = [12]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

var longMonths = [12]string{"January", "February", "March", "April", "May", "June", "July",
	"August", "September", "October", "November", "December"}

// prefix4 is s.slice(0, 4) for the year comparison FormatRange makes.
func prefix4(s string) string {
	if len(s) > 4 {
		return s[:4]
	}
	return s
}

// FormatRange writes a stay the way the artboards do: "Aug 12 – 19" in one month,
// "Aug 30 – Sep 5" across two, with ", 2027" on the end when the stay is not in today's
// year. today is YYYY-MM-DD in timeZone; empty means now, and then an unknown zone gives "".
// It is "" when either date is not real.
func FormatRange(checkIn, checkOut, timeZone, today string) string {
	a, okA := ParseISODate(checkIn)
	b, okB := ParseISODate(checkOut)
	if !okA || !okB {
		return ""
	}
	if today == "" {
		t, err := TodayISO(timeZone, clock())
		if err != nil {
			return ""
		}
		today = t
	}
	sameMonth := a.Year() == b.Year() && a.Month() == b.Month()
	thisYear := prefix4(today) == prefix4(checkIn) && prefix4(checkIn) == prefix4(checkOut)

	head := shortMonths[a.Month()-1] + " " + strconv.Itoa(a.Day())
	tail := strconv.Itoa(b.Day())
	if !sameMonth {
		tail = shortMonths[b.Month()-1] + " " + tail
	}
	if thisYear {
		return head + " – " + tail
	}
	return head + " – " + tail + ", " + strconv.Itoa(b.Year())
}

// FormatDayLong is one day for the picker's aria-labels: "Wednesday, August 12, 2026",
// or "" when iso is not a real date.
func FormatDayLong(iso string) string {
	t, ok := ParseISODate(iso)
	if !ok {
		return ""
	}
	return t.Weekday().String() + ", " + longMonths[t.Month()-1] + " " + strconv.Itoa(t.Day()) +
		", " + strconv.Itoa(t.Year())
}

// clock is the time now. Tests replace it; nothing else does.
var clock = time.Now
