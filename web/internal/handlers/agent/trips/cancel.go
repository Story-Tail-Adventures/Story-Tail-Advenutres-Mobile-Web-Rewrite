package trips

import (
	"fmt"
	"strings"
)

// Screen 3.4.16, cancelling a trip (and correcting a cancellation afterwards): the refund
// vocabulary, the impact list and the receipt, ported from web/lib/agent/cancelTrip.ts and
// content.ts (cancelLinesCheckbox, cancelReceipt).

// refundStatuses are the four the database CHECK constrains, and no more. "" is NOT a fifth:
// the column is nullable and null means "not stated", a different fact from none_expected.
var refundStatuses = []struct{ value, label string }{
	{"none_expected", "None expected"},
	{"pending", "Pending"},
	{"partial", "Partial"},
	{"full", "Full"},
}

func isRefundStatus(v string) bool {
	for _, s := range refundStatuses {
		if s.value == v {
			return true
		}
	}
	return false
}

// refundStatusLabel labels a stored value, and refuses ("") to echo one it does not know:
// the free text the column held before it had a vocabulary must not come back as a label.
func refundStatusLabel(v string) string {
	for _, s := range refundStatuses {
		if s.value == v {
			return s.label
		}
	}
	return ""
}

// impactLine is one consequence of cancelling. warn is something the advisor must go and do.
type impactLine struct {
	warn bool
	text string
}

// cancelImpact ports cancelImpact: what cancelling actually does, derived from this trip.
// Never a card line (there is no card) and never an invented supplier fee.
func cancelImpact(ov *overview) []impactLine {
	var lines []impactLine
	if !isZeroMoney(ov.totalCommission) {
		lines = append(lines, impactLine{text: fmt.Sprintf(
			"Commission expected drops by %s — a cancelled trip leaves the forecast.", ov.totalCommission)})
	}
	if !isZeroMoney(ov.totalPaidLabel) {
		lines = append(lines, impactLine{warn: true, text: fmt.Sprintf(
			"%s is recorded as paid. Cancelling does not move money — record where the refund stands below.", ov.totalPaidLabel)})
	}
	if ov.componentCount > 0 {
		verb := "items stay"
		if ov.componentCount == 1 {
			verb = "item stays"
		}
		lines = append(lines, impactLine{warn: true, text: fmt.Sprintf(
			"%d booked %s on the trip. Cancelling here does not tell any supplier.", ov.componentCount, verb)})
	}
	return lines
}

// isZeroMoney: whether a formatted money label is zero, by asking whether any digit in it
// is not a zero (re-parsing "$1,000" as a number is how it becomes 1).
func isZeroMoney(label string) bool { return !strings.ContainsAny(label, "123456789") }

// cancelLinesCheckbox: "Mark this line as Lost" / "Mark these 2 lines as Lost".
func cancelLinesCheckbox(n int) string {
	if n == 1 {
		return "Mark this line as Lost"
	}
	return fmt.Sprintf("Mark these %s lines as Lost", groupThousands(int64(n)))
}

// cancelReceipt ports content.ts cancelReceipt: the receipt a save leaves on screen when it
// named commission lines, "" when it named none (the dialog then simply closes). A line named
// but in neither count is said as unconfirmed, never as closed.
func cancelReceipt(cancelled bool, named, closed, skipped int) string {
	if named <= 0 {
		return ""
	}
	n := func(k int) string { return groupThousands(int64(k)) }
	parts := []string{"Details saved."}
	if cancelled {
		parts[0] = "Trip cancelled."
	}
	if closed > 0 {
		word := "lines"
		if closed == 1 {
			word = "line"
		}
		parts = append(parts, fmt.Sprintf("%s commission %s marked Lost.", n(closed), word))
	}
	if skipped > 0 {
		if skipped == 1 {
			parts = append(parts, "1 line changed since the page loaded, so it was left alone.")
		} else {
			parts = append(parts, fmt.Sprintf("%s lines changed since the page loaded, so they were left alone.", n(skipped)))
		}
	}
	if un := named - closed - skipped; un > 0 {
		if un == 1 {
			parts = append(parts, "We couldn't confirm 1 line was marked Lost. Check it in the ledger.")
		} else {
			parts = append(parts, fmt.Sprintf("We couldn't confirm %s lines were marked Lost. Check them in the ledger.", n(un)))
		}
	}
	return strings.Join(parts, " ")
}

// savedReceipt is TEMPLATE_COPY.savedReceipt.
func savedReceipt(components, days int) string {
	if days > 0 {
		return fmt.Sprintf("Saved. %s and %s captured.", plural(components, "booking", "bookings"), plural(days, "day", "days"))
	}
	return fmt.Sprintf("Saved. %s captured.", plural(components, "booking", "bookings"))
}
