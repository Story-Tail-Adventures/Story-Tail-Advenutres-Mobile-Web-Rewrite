package money

import (
	"fmt"
	"strings"
)

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

	// ── §3.7.7 Forecast (FORECAST_COPY) ────────────────────────────────────────
	copyStageInquiry   = "Inquiry"
	copyStageProposal  = "Proposal"
	copyStageBooked    = "Booked"
	copyStageTraveling = "Traveling"
	copyWeightLabel    = "Weight (%)"
	copyWeightsInvalid = "Each weight is a whole number from 0 to 100."
	copyWeightsStale   = "These weights were changed somewhere else, so yours weren't saved. Reload the page and try again."
	copySaveFailed     = "That didn't save. Try again in a moment."
	copyOverdue        = "Overdue"
	copyLater          = "Later"
	copyUndated        = "No travel dates yet"

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

// forecastAcross ports it: "Of $12,000 across 7 open trips · 64% confidence". The confidence
// is left off, never shown as 0%, when there is nothing to be confident about.
func forecastAcross(rawTotal string, trips, confidencePct int, hasConfidence bool) string {
	head := fmt.Sprintf("Of %s across %s open %s", rawTotal, groupThousands(int64(trips)), plural(trips, "trip", "trips"))
	if !hasConfidence {
		return head
	}
	return fmt.Sprintf("%s · %d%% confidence", head, confidencePct)
}

// forecastTripCount: "3 trips" under a stage.
func forecastTripCount(n int) string {
	return groupThousands(int64(n)) + " " + plural(n, "trip", "trips")
}

// forecastReceivedNote: "$200 of the forecast is already received, so the calendar leaves it out."
func forecastReceivedNote(amount string) string {
	return amount + " of the forecast is already received, so the calendar leaves it out."
}

// forecastMonthLabel ports forecast.ts monthLabel: "Oct 2026" for the first month and every
// January, "Nov" otherwise — the year only where it turns.
func forecastMonthLabel(iso string, first bool) string {
	d, ok := parseDay(iso)
	if !ok {
		return ""
	}
	if first || d.Month() == 1 {
		return fmt.Sprintf("%s %d", shortMonths[d.Month()-1], d.Year())
	}
	return shortMonths[d.Month()-1]
}

// ── §3.7.3 / §3.7.4, the line ───────────────────────────────────────────────────────────
//
// Only what Go CHOOSES BETWEEN is here; a label the page always shows lives in the HTML.

const (
	copySupplierRequired    = "Pick a supplier."
	copyGrossInvalid        = "Enter an amount like 6480.00."
	copyRateInvalid         = "Enter a rate from 0 to 100."
	copyLagInvalid          = "Enter whole days, 0 to 365."
	copyAmountInvalid       = "Enter an amount like 970.00."
	copyBadDate             = "Use today or an earlier date."
	copyReceivedNeedsAmount = "Received needs the amount that arrived. If nothing came, record it as Disputed."

	copyDuplicateReference = "That reference is already on another line."
	copySupplierGone       = "That supplier is no longer on file. Pick another."
	copyLineStale          = "This line changed since you opened it. Reload to see what changed."
	copyClearsPayment      = "Changing the status clears the payment recorded on this line."

	copySupplierNoLongerListed = "No longer listed"

	copyOpenTrip             = "Open trip"
	copyArchivedTripNote     = "This trip is archived. Its commission line stays on the record."
	copyExpectationNoEnd     = "No date yet: the trip has no end date."
	copyExpectationNotBooked = "No date yet: the trip has not been booked."

	copyRemoveRefused = "That line couldn't be removed. It may have changed since you opened it."

	// noFigure is the em dash CommissionLineForm shows for an Expected it cannot work out yet.
	noFigure = "\u2014"
)

// commissionLineHeading is the detail page's own: "Sandals Resorts · Kyoto in the spring ·
// $1,368 expected".
func commissionLineHeading(supplier, trip, expected string) string {
	return supplier + " · " + trip + " · " + expected + " expected"
}

// commissionPaidLine says what arrived, to the cent.
func commissionPaidLine(amount, dateLabel, fee string) string {
	if fee != "" {
		return "Received " + amount + " on " + dateLabel + ", after a " + fee + " fee."
	}
	return "Received " + amount + " on " + dateLabel + "."
}

// commissionTermsLine is the line's own terms, said as a sentence.
func commissionTermsLine(supplier, terms string, days int) string {
	atBooking := terms == "at_booking"
	var span string
	switch {
	case days == 0 && atBooking:
		span = "paid at booking"
	case days == 0:
		span = "paid when travel ends"
	case atBooking:
		span = "paid " + itoa(days) + " " + plural(days, "day", "days") + " after booking"
	default:
		span = "paid " + itoa(days) + " " + plural(days, "day", "days") + " after travel"
	}
	return supplier + " · " + span
}

// commissionExpectedOn is the date the line's terms point at.
func commissionExpectedOn(dateLabel string) string {
	return "Expected around " + dateLabel + "."
}

// commissionGapLine is the sentence under the payment amounts: expected − fee − received,
// said in words. Zero is settled; a shortfall the fee does not explain is the thing to chase.
func commissionGapLine(gapCents Cents, gapLabel string) string {
	switch {
	case gapCents == 0:
		return "Matches expected, once the fee is taken out."
	case gapCents > 0:
		return gapLabel + " short of expected, after the fee. Record it as Disputed to chase it."
	default:
		return gapLabel + " more than expected, after the fee."
	}
}

// ── §3.7.5 / §3.7.6, the statement ──────────────────────────────────────────────────────

const (
	copyIgnoreColumn     = "Ignore this column"
	copyFieldReference   = "Booking reference"
	copyFieldSupplier    = "Supplier"
	copyFieldTraveler    = "Traveler name"
	copyFieldGross       = "Gross booking"
	copyFieldReceived    = "Commission paid"
	copyFieldFee         = "Fee withheld"
	copyFieldPaidOn      = "Paid on"
	copyAutoChip         = "Auto"
	copyManualChip       = "Manual"
	copyMapNeedsReceived = "Choose the column that holds the commission paid."
	copyMapNeedsDate     = "Choose the paid-on column, or enter the date the statement paid."
	copyMapFailed        = "That didn't save. Try again in a moment."

	copyNoFile       = "Choose a CSV file first."
	copyTooBig       = "That file is larger than 512 KB. Check it's the statement."
	copyNotCsv       = "That isn't a CSV file. If it's an Excel file, save it as CSV and upload that."
	copyDuplicate    = "You've already imported this file."
	copyUploadFailed = "The upload didn't come through. Try again in a moment."

	copyStatusMapping    = "Needs columns"
	copyStatusReview     = "Ready to review"
	copyStatusReconciled = "Reconciled"

	copyConfidenceHigh   = "High"
	copyConfidenceMedium = "Medium"
	copyConfidenceLow    = "Low"

	copyAuto            = "Auto-matched"
	copyMatched         = "Matched"
	copyNewLine         = "New line"
	copySetAside        = "Set aside"
	copyAlreadyRecorded = "Already recorded"
	copyNoMatch         = "No match found"
	copyPossibleNew     = "Possible new booking. Create a line?"
	copyDuplicateRow    = "Same booking as an earlier row. Only one row can pay a booking, so choose what to do with this one."
	copyCheckSuggestion = "Check this match before it counts."

	copyStatementStale   = "This statement changed since you opened it. Reload the page and try again."
	copyNotOpen          = "This statement is already reconciled or discarded, so it can't change."
	copyReconcileFailed  = "That didn't save. Nothing in your ledger changed. Try again in a moment."
	copyReconcileUnsure  = "That didn't finish. Reload the page to see where the statement stands, then try again."
	copyRowNeedsYouAgain = "A row needs you again. It's at the top of the table."
	copyDiscardFailed    = "That didn't go through. Try again in a moment."

	copyLineUnavailable       = "That line can't take this payment anymore. It's been paid, or another row already matches it."
	copyTripGone              = "That trip isn't available anymore. Pick another."
	copyStatementSupplierGone = "That supplier isn't available anymore. Pick another."
	copyNotAllowed            = "That choice isn't available for this row."
	copyResolveFailed         = "That didn't save. Try again in a moment."
	copyCreateNeedsTrip       = "Choose a trip first."
	copyCreateNeedsGross      = "Enter the gross booking, like 6480.00."
	copyCreateNeedsRate       = "Enter a commission rate from 0 to 100."
	copyResolveTitle          = "Resolve a statement row"
	copyTripNotAvailable      = "That trip isn't available. Find another below."
)

func statementFieldTwice(field string) string {
	return field + " is chosen for two columns. Pick one."
}

func statementMonthLabel(month string) string { return month + " statement" }

func statementReconcileTitle(label string) string { return "Reconcile · " + label }

// statementSummary is the statement's own subtitle. The numbers are plain, NOT grouped: the
// TypeScript interpolates them straight, where the row counts elsewhere go through
// toLocaleString.
func statementSummary(total, matched, toResolve, setAside int) string {
	parts := []string{itoa(total) + " imported", itoa(matched) + " matched"}
	if setAside > 0 {
		parts = append(parts, itoa(setAside)+" set aside")
	}
	if toResolve == 0 {
		parts = append(parts, "nothing to resolve")
	} else {
		parts = append(parts, itoa(toResolve)+" to resolve")
	}
	return strings.Join(parts, " · ")
}

// statementUploadedLine groups the count, where statementSummary does not.
func statementUploadedLine(filename string, rows int) string {
	return "Uploaded: " + filename + " · " + countLabel(rows, "row", "rows") + " found"
}

func statementStillNeedYou(count int) string {
	return "Resolve " + itoa(count) + " more " + plural(count, "row", "rows") + " to reconcile."
}

// statementReconcileBody says what the one ledger-changing action will do, before it runs.
func statementReconcileBody(paid, created int) string {
	var what []string
	if paid > 0 {
		what = append(what, "records "+itoa(paid)+" "+plural(paid, "payment", "payments"))
	}
	if created > 0 {
		what = append(what, "adds "+itoa(created)+" new "+plural(created, "line", "lines"))
	}
	head := "Nothing in your ledger changes."
	if len(what) > 0 {
		head = "This " + strings.Join(what, " and ") + " in your ledger."
	}
	return head + " Lines you already marked paid stay as they are."
}

func statementReconciledLine(date string, paid, created int) string {
	return "Reconciled " + date + ": " + itoa(paid) + " " + plural(paid, "payment", "payments") +
		" recorded, " + itoa(created) + " new " + plural(created, "line", "lines") + "."
}

// statementAlreadyNote is the row note for a line the advisor had already marked paid. When
// the two figures disagree it says both rather than claiming either is right.
func statementAlreadyNote(status, ledgerAmount, statementAmount string) string {
	marked := "Received"
	if status == "disputed" {
		marked = "Disputed"
	}
	if ledgerAmount != "" && statementAmount != "" && statementAmount != ledgerAmount {
		return "Your ledger says " + ledgerAmount + "; this statement says " + statementAmount +
			". If the ledger's wrong, fix it on the line."
	}
	if ledgerAmount != "" {
		return "Already marked " + marked + " (" + ledgerAmount + "). This import won't change it."
	}
	return "Already marked " + marked + " on your ledger. This import won't change it."
}

func statementCandidateMeta(supplier, client, expected string) string {
	return supplier + " · " + client + " · expected " + expected
}

func statementOverNote(gap string) string { return gap + " more than expected." }

// statementShortNote is the note §3.7.6 exists for: what was expected, what arrived, and
// what that means for the line.
func statementShortNote(expected, paid, fee, gap string, done bool) string {
	paidPart := "Paid " + paid + "."
	if fee != "" {
		paidPart = "Paid " + paid + " plus a " + fee + " fee."
	}
	willBe := "will be"
	if done {
		willBe = "was"
	}
	return "Expected " + expected + ". " + paidPart + " That's " + gap + " short, so it " + willBe + " marked Disputed."
}

func statementRateNote(paidPct, linePct string) string {
	return "Paid at about " + paidPct + " of the booking, not " + linePct + "."
}

// statementSample labels a column's first non-blank value on the map screen.
func statementSample(value string) string { return "Example: " + value }

// statementImportRows is the map form's submit: what saving the columns will bring in.
func statementImportRows(rows int) string {
	return "Import " + countLabel(rows, "row", "rows")
}
