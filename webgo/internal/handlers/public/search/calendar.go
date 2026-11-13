package search

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// Month-grid arithmetic for the date-range picker. Ports web/lib/public/calendar.ts. Pure,
// so the keyboard model and the month layout are testable without rendering anything.
//
// Weeks start on Sunday, the US convention the rest of the public surface uses.

// CalendarDay is one cell of the month grid.
type CalendarDay struct {
	ISO string
	Day int
	// InMonth is false for the leading and trailing days that pad the grid to whole weeks.
	InMonth bool
}

// CalendarMonth is one page of the picker.
type CalendarMonth struct {
	// Key is YYYY-MM, what a caller pages through.
	Key   string
	Label string
	Year  int
	// Month is 1 to 12.
	Month int
	// Weeks is always six rows of seven, Sunday first, so the popover does not resize as
	// the visitor pages.
	Weeks [][]CalendarDay
}

// WeekdayLabels are the grid's column heads, Sunday first.
var WeekdayLabels = [7]string{"Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"}

// MonthKey is the YYYY-MM an ISO date falls in (its first seven characters).
func MonthKey(iso string) string {
	return sliceUTF16(iso, 7)
}

// monthKeyParts is key.split("-").map(Number) for the first two parts. A missing month is
// NaN, as undefined - 1 is.
func monthKeyParts(key string) (y, m float64) {
	parts := strings.Split(key, "-")
	y = toNumber(parts[0])
	m = math.NaN()
	if len(parts) > 1 {
		m = toNumber(parts[1])
	}
	return y, m
}

// AddMonths is key moved by delta months. The arithmetic is the TypeScript's, in the same
// floating point, so a key that is not YYYY-MM comes out as it did there ("NaN-NaN").
func AddMonths(key string, delta int) string {
	y, m := monthKeyParts(key)
	total := y*12 + (m - 1) + float64(delta)
	year := math.Floor(total / 12)
	month := math.Mod(total, 12) + 1 // % keeps the dividend's sign, as math.Mod does
	return padStart(numberString(year), 4) + "-" + padStart(numberString(month), 2)
}

// jsTimeLimit is the largest distance from the epoch a JavaScript Date can hold, in ms.
const jsTimeLimit = 8.64e15

// BuildMonth lays out the month key names (YYYY-MM). False where the TypeScript threw: a
// key whose year or month is not a number, or a date outside what a JavaScript Date holds.
// It is also false for a year or month that is not a whole number, or a year before 1,
// which the TypeScript drew a muddled grid for.
func BuildMonth(key string) (CalendarMonth, bool) {
	y, m := monthKeyParts(key)
	if math.IsNaN(y) || math.IsNaN(m) || math.IsInf(y, 0) || math.IsInf(m, 0) ||
		y != math.Trunc(y) || m != math.Trunc(m) || math.Abs(y) > 300_000 || math.Abs(m) > 4_000_000 {
		return CalendarMonth{}, false
	}
	year, month := int(y), int(m)
	first := dateUTC(year, month-1, 1, 12)
	if math.Abs(float64(first.UnixMilli())) > jsTimeLimit || first.Year() < 1 {
		return CalendarMonth{}, false
	}
	daysInMonth := dateUTC(year, month, 0, 12).Day()
	leading := int(first.Weekday())

	weeks := make([][]CalendarDay, 0, 6)
	// Six rows of seven, always: a month starting on Saturday with 31 days needs six, and a
	// grid that changes height as you page makes the popover jump under the cursor.
	for row := 0; row < 6; row++ {
		week := make([]CalendarDay, 0, 7)
		for col := 0; col < 7; col++ {
			offset := row*7 + col - leading
			date := first.AddDate(0, 0, offset)
			week = append(week, CalendarDay{
				ISO:     ToISODate(date),
				Day:     date.Day(),
				InMonth: offset >= 0 && offset < daysInMonth,
			})
		}
		weeks = append(weeks, week)
	}
	return CalendarMonth{
		Key:   key,
		Label: longMonths[first.Month()-1] + " " + strconv.Itoa(first.Year()),
		Year:  year,
		Month: month,
		Weeks: weeks,
	}, true
}

// MoveFocus is where a keypress (a KeyboardEvent key name) moves the focused day: the new
// ISO date, or false for a key that does nothing or a date that is not real.
func MoveFocus(iso, key string) (string, bool) {
	switch key {
	case "ArrowLeft":
		return AddDays(iso, -1)
	case "ArrowRight":
		return AddDays(iso, 1)
	case "ArrowUp":
		return AddDays(iso, -7)
	case "ArrowDown":
		return AddDays(iso, 7)
	case "Home":
		t, ok := ParseISODate(iso)
		if !ok {
			return "", false
		}
		return AddDays(iso, -int(t.Weekday()))
	case "End":
		t, ok := ParseISODate(iso)
		if !ok {
			return "", false
		}
		return AddDays(iso, 6-int(t.Weekday()))
	case "PageUp":
		return shiftMonth(iso, -1)
	case "PageDown":
		return shiftMonth(iso, 1)
	}
	return "", false
}

// shiftMonth is the same day of the month one month away, clamped to the month's last day:
// PageDown from 31 January lands on 28 February rather than rolling into March.
func shiftMonth(iso string, delta int) (string, bool) {
	t, ok := ParseISODate(iso)
	if !ok {
		return "", false
	}
	day := t.Day()
	target := dateUTC(t.Year(), int(t.Month())-1+delta, 1, 12)
	lastDay := dateUTC(target.Year(), int(target.Month()), 0, 12).Day()
	return ToISODate(time.Date(target.Year(), target.Month(), min(day, lastDay), 12, 0, 0, 0, time.UTC)), true
}

// IsBetween reports whether iso sits strictly inside the selected range, for the
// connecting highlight. An empty start or end is no range.
func IsBetween(iso, start, end string) bool {
	return start != "" && end != "" && iso > start && iso < end
}
