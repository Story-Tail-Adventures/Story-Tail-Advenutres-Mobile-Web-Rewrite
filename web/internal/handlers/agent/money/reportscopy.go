package money

import "fmt"

// §3.11 Reporting's words that Go CHOOSES BETWEEN (web/lib/agent/reportsCopy.ts), byte for
// byte. Copy that never varies is written into the page files, where it reads as the page;
// copy_test.go holds both to reportsCopy.ts, so a changed sentence there fails here.
//
// REPORTS_COPY.exportFailed is the same sentence as COMMISSION_COPY's, so copyExportFailed
// serves both; everything else that a report screen picks between is here.

const (
	// ── Shared ─────────────────────────────────────────────────────────────────
	copyPeriodYtd  = "Year to date"
	copyPeriod12mo = "Last 12 months"
	copyPeriodQtd  = "This quarter"

	// ── 3.11.2 Revenue by Month ────────────────────────────────────────────────
	copyBasisBooked         = "Booked value"
	copyBasisReceived       = "Commission received"
	copyRevenueBookedNote   = "Each trip counts once, in the month it was first booked. Cancelled trips, and trips that went back to an earlier stage, are left out."
	copyRevenueReceivedNote = "Commission that arrived from suppliers, by the day it came in."
	copyRevenueEmptyBooked  = "Nothing booked in this period yet."
	copyRevenueEmptyRecvd   = "No commission received in this period yet."
	copyCompareShow         = "Compare with last year"
	copyCompareHide         = "Hide last year"
	copyColBooked           = "Booked value"
	copyColReceived         = "Received"
	copyColTrips            = "Trips"
	copyColPayments         = "Commission payments"

	// ── 3.11.4 Top Destinations ────────────────────────────────────────────────
	copyNoDestination = "No destination yet"

	// ── 3.11.5 Client Lifetime Value ───────────────────────────────────────────
	copyClientsEmpty       = "No booked trips yet."
	copyClientsCohortEmpty = "No clients in this cohort."
	copyCohortAll          = "All clients"
	copyNoCohort           = "Before tracking"

	// ── 3.11.6 Conversion Funnel ───────────────────────────────────────────────
	copyStageInquiryF  = "Inquiry"
	copyStageProposalF = "Proposal"
	copyStageBookedF   = "Booked"
	copyStageTraveled  = "Traveled"
	copyBookDaysNone   = "No trips from this period have booked yet."

	// ── 3.11.7 Pipeline Value ──────────────────────────────────────────────────
	// The same three words as the forecast's calendar, held apart on purpose: they belong to
	// two copy objects, and one of them can change without the other.
	copyPastStart  = "Start date passed"
	copyRptLater   = "Later"
	copyRptUndated = "No travel dates yet"

	// ── 3.11.8 Export Center ───────────────────────────────────────────────────
	copyTypeLedger     = "Commission ledger"
	copyTypeTrips      = "Trips"
	copyTypeMilestones = "Payment milestones"
	copyTypeClients    = "Clients"
	copyRunAgain       = "Run again"
	copyWithContact    = "with contact details"
)

// funnelStageLabels are REPORTS_COPY.funnelStages, in order: the four rows are drawn from
// this list, not from the rows, so a stage the read did not return still shows as zero.
var funnelStageLabels = []string{copyStageInquiryF, copyStageProposalF, copyStageBookedF, copyStageTraveled}

// exportTypes are §3.11.8's four, in reportsCopy.ts's order, with their names.
var exportTypes = []string{"ledger", "trips", "milestones", "clients"}

var exportTypeNames = map[string]string{
	"ledger":     copyTypeLedger,
	"trips":      copyTypeTrips,
	"milestones": copyTypeMilestones,
	"clients":    copyTypeClients,
}

// reportNames are the six reports whose Export writes a `report.exported` row, as the
// history line titles them.
var reportNames = map[string]string{
	"revenue":      copyRevenueTitle,
	"suppliers":    copySuppliersTitle,
	"destinations": copyDestinationsTitle,
	"clients":      copyClientsTitle,
	"funnel":       copyFunnelTitle,
	"pipeline":     copyPipelineTitle,
}

// The six report titles. They are the page headings too, so each page file carries the same
// string; these copies exist for the Export Center's history lines.
const (
	copyRevenueTitle      = "Revenue by month"
	copySuppliersTitle    = "Commission by supplier"
	copyDestinationsTitle = "Top destinations"
	copyClientsTitle      = "Client lifetime value"
	copyFunnelTitle       = "Conversion funnel"
	copyPipelineTitle     = "Pipeline value"
)

// periodNames is PERIOD_NAMES.
var periodNames = map[string]string{
	"ytd":  copyPeriodYtd,
	"12mo": copyPeriod12mo,
	"qtd":  copyPeriodQtd,
}

// leadSourceNames is LEAD_SOURCE_NAMES; a source it does not know keeps its own value.
var leadSourceNames = map[string]string{
	"website":  "Website form",
	"email":    "Email",
	"phone":    "Phone",
	"referral": "Referral",
	"social":   "Social",
	"other":    "Other",
}

// suppliersSetAside ports it: the footnote, and nothing at zero. It names any money already
// received on those lines, because Revenue's "Commission received" counts it and §3.11.3
// does not.
func suppliersSetAside(n int, receivedLabel string) string {
	if n <= 0 {
		return ""
	}
	lines := fmt.Sprintf("%d disputed or lost lines are set aside and not counted here", n)
	if n == 1 {
		lines = "1 disputed or lost line is set aside and not counted here"
	}
	if receivedLabel != "" {
		return lines + ", including " + receivedLabel + " already received on them."
	}
	return lines + "."
}

// reportChangeVsLastYear ports it: "+22% vs last year" with a real minus sign, as the
// commission chip has.
func reportChangeVsLastYear(pct int) string {
	if pct == 0 {
		return "Same as last year"
	}
	sign := "+"
	if pct < 0 {
		sign = "−"
		pct = -pct
	}
	return fmt.Sprintf("%s%d%% vs last year", sign, pct)
}

// funnelTrips ports it: "1 trip", "38 trips" on a funnel bar.
func funnelTrips(n int) string {
	return fmt.Sprintf("%d %s", n, plural(n, "trip", "trips"))
}

// funnelSummary ports it: "142 inquiries → 32 traveled · 22.5% made it all the way".
func funnelSummary(inquiries, traveled int, pct string) string {
	head := fmt.Sprintf("%d %s → %d traveled", inquiries, plural(inquiries, "inquiry", "inquiries"), traveled)
	if pct == "" {
		return head
	}
	return head + " · " + pct + " made it all the way"
}

// funnelStopped ports it: "−22 · 15 still open, 7 cancelled", only the parts above zero.
func funnelStopped(open, cancelled int) string {
	if open+cancelled == 0 {
		return ""
	}
	var parts []string
	if open > 0 {
		parts = append(parts, fmt.Sprintf("%d still open", open))
	}
	if cancelled > 0 {
		parts = append(parts, fmt.Sprintf("%d cancelled", cancelled))
	}
	out := fmt.Sprintf("−%d · %s", open+cancelled, parts[0])
	if len(parts) > 1 {
		out += ", " + parts[1]
	}
	return out
}

// funnelBookDays ports it: "18.4 days on average from inquiry to booked, across 38 trips".
func funnelBookDays(days string, n int) string {
	word := "days"
	if days == "1.0" {
		word = "day"
	}
	return fmt.Sprintf("%s %s on average from inquiry to booked, across %d %s.", days, word, n, plural(n, "trip", "trips"))
}

// pipelineOpenSub ports it: "29 trips, at full value".
func pipelineOpenSub(n int) string {
	return fmt.Sprintf("%d %s, at full value", n, plural(n, "trip", "trips"))
}

// pipelineBucketTrips ports it: "Later · 3 trips".
func pipelineBucketTrips(label string, n int) string {
	if n <= 0 {
		return label
	}
	return fmt.Sprintf("%s · %d %s", label, n, plural(n, "trip", "trips"))
}

// exportRows ports it: "12 rows" on a history line.
func exportRows(n int) string { return countLabel(n, "row", "rows") }

// reportTotalFor ports it: "Total · Year to date".
func reportTotalFor(periodName string) string { return "Total · " + periodName }

// leadSourcesSummary ports it: the Lead Sources subtitle.
func leadSourcesSummary(total, clients int) string {
	if total == 0 {
		return "No leads yet in this period"
	}
	became := "clients"
	if clients == 1 {
		became = "a client"
	}
	return fmt.Sprintf("%d %s · %d became %s", total, plural(total, "lead", "leads"), clients, became)
}
