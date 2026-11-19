package money

import "fmt"

// COMMISSION_COPY's strings that Go CHOOSES BETWEEN (web/lib/agent/content.ts), byte for
// byte. Copy that never varies is written into the page files instead, where it reads as the
// page; copy_test.go holds both to content.ts, so a changed sentence there fails here.
const (
	copyRateUnavailable = "Nothing received yet this year."
	copyNothingDisputed = "Nothing disputed"
	copyNothingUpcoming = "Nothing priced in the next 90 days"

	copyTripFilterPrefix  = "One trip:"
	copyTripFilterUnnamed = "One trip only"

	copyEmptyTitle         = "No commission lines yet"
	copyEmptyBody          = "Use Add line to enter one, or import a statement from Inteletravel."
	copyEmptyFilteredTitle = "Nothing matches"
	copyEmptyFilteredBody  = "Try another status, supplier or date range."
	copyEmptyTripTitle     = "No lines for this trip yet"
	copyEmptyTripBody      = "Its forecast commission still shows on the trip's cost card."

	copyNoDates      = "No dates yet"
	copyArchivedTrip = "Archived"

	copyExportFailed = "The export didn't come through. Go back and try again in a moment."

	// The five status filters' labels, in COMMISSION_STATUS_FILTERS' order.
	copyFilterExpected = "Expected"
	copyFilterInvoiced = "Invoiced"
	copyFilterReceived = "Received"
	copyFilterDisputed = "Disputed"
	copyFilterLost     = "Lost"
)

// commissionTripCount ports it: "5 trips", "1 trip" — the Expected · 90d tile's second line.
func commissionTripCount(count int) string {
	return fmt.Sprintf("%d %s", count, plural(count, "trip", "trips"))
}

// commissionDisputedCount ports it: "1 disputed" — the At risk tile's second line.
func commissionDisputedCount(count int) string {
	if count == 0 {
		return copyNothingDisputed
	}
	return fmt.Sprintf("%d disputed", count)
}

// signedChange ports content.ts's: a TRUE MINUS SIGN (U+2212, not a hyphen, so a fall reads
// as one at a glance in small type), or "No change" when it rounds to zero.
func signedChange(value string, isZero, isFall bool, against string) string {
	if isZero {
		return "No change vs " + against
	}
	sign := "+"
	if isFall {
		sign = "−"
	}
	return sign + value + " vs " + against
}

// commissionChangeVsLastYear: "+24% vs last year" — the same Jan-1-to-today window a year back.
func commissionChangeVsLastYear(pct int) string {
	return signedChange(fmt.Sprintf("%d%%", abs(pct)), pct == 0, pct < 0, "last year")
}

// commissionRateChangeVsLastYear: "+0.4 pts vs last year". A change in a RATE is points,
// never a percentage of a percentage.
func commissionRateChangeVsLastYear(points float64) string {
	shown := toFixed(absF(points), 1)
	return signedChange(shown+" pts", shown == "0.0", points < 0, "last year")
}

// commissionTrendChange: the chart's twelve months against the twelve before them. Worded
// apart from the tiles' "vs last year" on purpose — that is a calendar-year window, this is
// a rolling one, and the same words would invite comparing two different numbers.
func commissionTrendChange(pct int) string {
	return signedChange(fmt.Sprintf("%d%%", abs(pct)), pct == 0, pct < 0, "the 12 months before")
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func absF(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
