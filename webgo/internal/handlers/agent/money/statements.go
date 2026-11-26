package money

import (
	"sort"
	"strings"
)

// §3.7.5 and §3.7.6's view models — a port of web/lib/agent/statements.ts, built like
// commission.go: plain data out, formatted here, and a failed read says so rather than
// coming back empty.
//
// MONEY TO THE CENT. The ledger shows whole dollars (Gyasi, 2026-10-11); a statement is the
// record of what was paid, and reconciling it is the one job where $1,189.50 and $1,190 are
// different answers. cents2, never money().

// blockingStates are the rows that stop "Mark as reconciled": each needs a decision.
var blockingStates = []string{"suggested", "unmatched", "duplicate", "unreadable"}

func blocksReconcile(state string) bool {
	for _, s := range blockingStates {
		if s == state {
			return true
		}
	}
	return false
}

func statementPath(importID string) string { return "/agent/commission/import/" + importID }

func statementStatusLabel(status string) string {
	switch status {
	case "mapping":
		return copyStatusMapping
	case "reconciled":
		return copyStatusReconciled
	default:
		return copyStatusReview
	}
}

func statementStatusChip(status string) string {
	switch status {
	case "mapping":
		return "inquiry"
	case "reconciled":
		return "booked"
	default:
		return "proposal"
	}
}

// statementLabel is "April 2026 statement" when every paid-on date falls in one month, and
// the file's name otherwise — the prototype's "April statement", without guessing a month
// for a file that spans two.
func statementLabel(filename, start, end string) string {
	if len(start) >= 7 && len(end) >= 7 && start[:7] == end[:7] {
		if month := monthLong(start); month != "" {
			return statementMonthLabel(month)
		}
	}
	return filename
}

// ── The list ────────────────────────────────────────────────────────────────────────────

// statementListRow is one row of agent_commission_imports.
type statementListRow struct {
	ImportID         string  `json:"import_id"`
	OriginalFilename string  `json:"original_filename"`
	Status           string  `json:"status"`
	TotalRows        int     `json:"total_rows"`
	MatchedRows      int     `json:"matched_rows"`
	PeriodStart      *string `json:"period_start"`
	PeriodEnd        *string `json:"period_end"`
	CreatedOn        string  `json:"created_on"`
}

// statementListItem is one line of "Past statements".
type statementListItem struct {
	ImportID      string
	Href          string
	Label         string
	Filename      string
	StatusLabel   string
	StatusChip    string
	RowsLabel     string
	UploadedLabel string
}

func statementListView(rows []statementListRow) []statementListItem {
	out := make([]statementListItem, 0, len(rows))
	for _, r := range rows {
		item := statementListItem{
			ImportID:    r.ImportID,
			Href:        statementPath(r.ImportID),
			Label:       statementLabel(r.OriginalFilename, str(r.PeriodStart), str(r.PeriodEnd)),
			Filename:    r.OriginalFilename,
			StatusLabel: statementStatusLabel(r.Status),
			StatusChip:  statementStatusChip(r.Status),
			// The matched count is final only once reconciled: while a statement is in
			// review each decision moves it, and the stored number would be stale.
			RowsLabel: countLabel(r.TotalRows, "row", "rows"),
		}
		if r.Status == "reconciled" {
			item.RowsLabel += " · " + itoa(r.MatchedRows) + " matched"
		}
		// The advisor's own calendar date, from SQL: the UTC date of an evening upload in
		// the US is tomorrow's.
		if label := travelDateLabel(r.CreatedOn); label != "" {
			item.UploadedLabel = label
		} else {
			item.UploadedLabel = r.CreatedOn
		}
		out = append(out, item)
	}
	return out
}

// ── One statement ───────────────────────────────────────────────────────────────────────

// statementRow is one row of agent_commission_import.
type statementRow struct {
	ImportID             string         `json:"import_id"`
	OriginalFilename     string         `json:"original_filename"`
	Status               string         `json:"status"`
	Headers              []string       `json:"headers"`
	ColumnMap            map[string]int `json:"column_map"`
	StatementDate        *string        `json:"statement_date"`
	TotalRows            int            `json:"total_rows"`
	PeriodStart          *string        `json:"period_start"`
	PeriodEnd            *string        `json:"period_end"`
	Version              int            `json:"version"`
	ReconciledOn         *string        `json:"reconciled_on"`
	ConfirmedCount       int            `json:"confirmed_count"`
	SuggestedCount       int            `json:"suggested_count"`
	UnmatchedCount       int            `json:"unmatched_count"`
	DuplicateCount       int            `json:"duplicate_count"`
	UnreadableCount      int            `json:"unreadable_count"`
	AlreadyRecordedCount int            `json:"already_recorded_count"`
	ToCreateCount        int            `json:"to_create_count"`
	IgnoredCount         int            `json:"ignored_count"`
	SampleRows           [][]string     `json:"sample_rows"`
	AsOfDate             string         `json:"as_of_date"`
}

// statement is StatementView.
type statement struct {
	ImportID string
	Version  int
	// Status is mapping, review or reconciled; anything else reads as review.
	Status    string
	Filename  string
	Title     string
	Subtitle  string
	TotalRows int
	// NeedYou is the rows that must be decided before Mark as reconciled.
	NeedYou int
	// WillPay and WillCreate are what reconciling would do.
	WillPay    int
	WillCreate int
	Headers    []string
	// Selections is one per header: the platform field it holds, or "" to ignore it.
	Selections    []string
	StatementDate string
	// Samples is, per header, the first non-blank value from the sample rows.
	Samples      []string
	ReconciledOn string
	Today        string
}

func statementView(r statementRow) statement {
	needYou := r.SuggestedCount + r.UnmatchedCount + r.DuplicateCount + r.UnreadableCount
	// Settled rows only. A suggestion is not matched until the advisor confirms it; counting
	// it here too made "36 matched · 3 need you" out of 38 rows.
	matched := r.ConfirmedCount + r.AlreadyRecordedCount + r.ToCreateCount
	status := "review"
	if r.Status == "mapping" || r.Status == "reconciled" {
		status = r.Status
	}
	label := statementLabel(r.OriginalFilename, str(r.PeriodStart), str(r.PeriodEnd))

	samples := make([]string, len(r.Headers))
	for i := range r.Headers {
		for _, row := range r.SampleRows {
			if i < len(row) {
				if v := strings.TrimSpace(row[i]); v != "" {
					samples[i] = v
					break
				}
			}
		}
	}
	return statement{
		ImportID:      r.ImportID,
		Version:       r.Version,
		Status:        status,
		Filename:      r.OriginalFilename,
		Title:         statementReconcileTitle(label),
		Subtitle:      statementSummary(r.TotalRows, matched, needYou, r.IgnoredCount),
		TotalRows:     r.TotalRows,
		NeedYou:       needYou,
		WillPay:       r.ConfirmedCount,
		WillCreate:    r.ToCreateCount,
		Headers:       r.Headers,
		Selections:    selectionsFromMap(r.ColumnMap, len(r.Headers)),
		StatementDate: str(r.StatementDate),
		Samples:       samples,
		ReconciledOn:  travelDateLabel(str(r.ReconciledOn)),
		Today:         r.AsOfDate,
	}
}

// ── Its rows ────────────────────────────────────────────────────────────────────────────

// statementLineRow is one row of agent_commission_import_rows.
type statementLineRow struct {
	RowID         string  `json:"row_id"`
	RowNumber     int     `json:"row_number"`
	State         string  `json:"state"`
	MatchBasis    string  `json:"match_basis"`
	Reference     *string `json:"reference"`
	SupplierText  *string `json:"supplier_text"`
	TravelerText  *string `json:"traveler_text"`
	GrossCents    *Cents  `json:"gross_cents"`
	ReceivedCents *Cents  `json:"received_cents"`
	FeeCents      *Cents  `json:"fee_cents"`
	PaidOn        *string `json:"paid_on"`
	Currency      string  `json:"currency"`
	ParseError    *string `json:"parse_error"`

	LineID            *string `json:"line_id"`
	LineTripID        *string `json:"line_trip_id"`
	LineTripTitle     *string `json:"line_trip_title"`
	LineClientName    *string `json:"line_client_name"`
	LineSupplierName  *string `json:"line_supplier_name"`
	LineStatus        *string `json:"line_status"`
	LineGrossCents    *Cents  `json:"line_gross_cents"`
	LineCommissionPct Rate    `json:"line_commission_pct"`
	LineExpectedCents *Cents  `json:"line_expected_cents"`
	LineReceivedCents *Cents  `json:"line_received_cents"`

	NewTripID        *string `json:"new_trip_id"`
	NewTripTitle     *string `json:"new_trip_title"`
	NewSupplierID    *string `json:"new_supplier_id"`
	NewSupplierName  *string `json:"new_supplier_name"`
	NewGrossCents    *Cents  `json:"new_gross_cents"`
	NewCommissionPct Rate    `json:"new_commission_pct"`
}

// statementRowItem is StatementRowView.
type statementRowItem struct {
	RowID     string
	RowNumber int
	State     string
	NeedsYou  bool
	// StatementLine is the prototype's mono cell: "SRB-220119 · Sandals Resorts · M Hayes".
	StatementLine string
	AmountLabel   string
	PaidOnLabel   string
	// MatchLabel is the line this row pays, or what will be created.
	MatchLabel string
	MatchHref  string
	// Note is the warning under the match: a shortfall, a rate, a duplicate, a parse error.
	Note string
	// ConfidenceLabel is empty once the advisor has decided the row: the matcher's
	// confidence no longer describes it.
	ConfidenceLabel string
	ConfidenceChip  string
	// DoneLabel is what the action cell shows when there is nothing to decide.
	DoneLabel   string
	ResolveHref string
}

func rowConfidence(basis, state string) (label, chip string) {
	switch {
	case state == "to_create" || state == "ignored":
		return "", "past"
	case state == "unreadable" || basis == "none":
		return copyConfidenceLow, "due"
	case basis == "supplier_and_traveler":
		return copyConfidenceMedium, "proposal"
	default:
		return copyConfidenceHigh, "booked"
	}
}

// paidRate is "14%" from (received + fee) / gross, to one place; empty with no gross.
func paidRate(paid, gross Cents) string {
	if gross <= 0 {
		return ""
	}
	return rateLabel(jsRound(float64(paid)/float64(gross)*1000) / 10)
}

func centsOr(p *Cents, fallback Cents) Cents {
	if p == nil {
		return fallback
	}
	return *p
}

// paymentNote is the note §3.7.6 exists for. For a row about to pay its line: the gap
// (expected − fee − received) and, when it is short, the rate the payment works out to
// against the BOOKING — the prototype's "Sandals applied 14% not 15%", computed rather than
// asserted.
func paymentNote(r statementLineRow, done bool) string {
	if r.LineExpectedCents == nil || r.ReceivedCents == nil {
		return ""
	}
	expected, fee, received := *r.LineExpectedCents, centsOr(r.FeeCents, 0), *r.ReceivedCents
	gap := expected - fee - received
	if gap == 0 {
		return ""
	}
	if gap < 0 {
		return statementOverNote(cents2(-gap))
	}
	feeLabel := ""
	if fee > 0 {
		feeLabel = cents2(fee)
	}
	short := statementShortNote(cents2(expected), cents2(received), feeLabel, cents2(gap), done)

	// Against the line's BOOKED gross, never the statement's: the question is what rate the
	// supplier paid on the booking the advisor recorded. A statement whose own gross differs
	// made the first draft say "paid at 13.1%, not 12%" about a payment that was SHORT.
	paid := paidRate(received+fee, centsOr(r.LineGrossCents, 0))
	linePct := ""
	if r.LineCommissionPct.Set {
		linePct = rateLabel(r.LineCommissionPct.Value)
	}
	if paid != "" && linePct != "" && paid != linePct {
		return short + " " + statementRateNote(paid, linePct)
	}
	return short
}

// lineLabelOf is "Sandals Resorts · Jordan Hayes · Anniversary Week in Negril": the line a
// row pays, or the one the matcher suggested. The client's WHOLE name — the first draft took
// the last word, and "Van Der Berg" read "Berg".
func lineLabelOf(r statementLineRow) string {
	if r.LineID == nil {
		return ""
	}
	return joinDot([]string{str(r.LineSupplierName), str(r.LineClientName), str(r.LineTripTitle)})
}

// createNote is, for a line the advisor chose to create, the shortfall it will start with.
func createNote(r statementLineRow, done bool) string {
	if !r.NewCommissionPct.Set || r.NewGrossCents == nil || r.ReceivedCents == nil {
		return ""
	}
	gross := *r.NewGrossCents
	head := cents2(gross) + " at " + rateLabel(r.NewCommissionPct.Value)
	// Postgres's round(), half away from zero, on a positive amount: Math.round agrees.
	expected := Cents(jsRound(float64(gross) * r.NewCommissionPct.Value / 100))
	fee, received := centsOr(r.FeeCents, 0), *r.ReceivedCents
	gap := expected - fee - received
	if gap <= 0 {
		return head
	}
	feeLabel := ""
	if fee > 0 {
		feeLabel = cents2(fee)
	}
	return head + ". " + statementShortNote(cents2(expected), cents2(received), feeLabel, cents2(gap), done)
}

func statementRowView(r statementLineRow, importID string, reconciled bool) statementRowItem {
	label, chip := rowConfidence(r.MatchBasis, r.State)
	lineLabel := lineLabelOf(r)

	matchLabel := lineLabel
	if matchLabel == "" {
		matchLabel = copyNoMatch
	}
	matchHref := ""
	if r.LineID != nil {
		matchHref = linePath(*r.LineID)
	}
	note, doneLabel := "", ""

	switch r.State {
	case "confirmed":
		note = paymentNote(r, reconciled)
		// "Auto" only where the matcher was certain (a reference); a suggestion the advisor
		// confirmed, or a line they picked, is "Matched".
		if r.MatchBasis == "reference" || r.MatchBasis == "confirmation" {
			doneLabel = copyAuto
		} else {
			doneLabel = copyMatched
		}
	case "suggested":
		note = paymentNote(r, false)
		if note == "" {
			note = copyCheckSuggestion
		}
	case "already_recorded":
		status := "received"
		if str(r.LineStatus) == "disputed" {
			status = "disputed"
		}
		note = statementAlreadyNote(status, centsLabel(r.LineReceivedCents), centsLabel(r.ReceivedCents))
		doneLabel = copyAlreadyRecorded
	case "to_create":
		matchLabel = joinDot([]string{str(r.NewSupplierName), str(r.NewTripTitle)})
		// Before reconcile the line does not exist (LineID is the old suggestion, if any);
		// after, it is the line this row created.
		matchHref = ""
		if reconciled && r.LineID != nil {
			matchHref = linePath(*r.LineID)
		}
		note = createNote(r, reconciled)
		doneLabel = copyNewLine
	case "ignored":
		matchLabel = lineLabel
		if matchLabel == "" {
			matchLabel = noFigure
		}
		matchHref = ""
		doneLabel = copySetAside
	case "duplicate":
		note = copyDuplicateRow
	case "unreadable":
		matchLabel, matchHref = noFigure, ""
		note = str(r.ParseError)
	default: // unmatched
		note = copyPossibleNew
	}

	statementLine := joinDot([]string{str(r.Reference), str(r.SupplierText), str(r.TravelerText)})
	if statementLine == "" {
		statementLine = noFigure
	}
	return statementRowItem{
		RowID:           r.RowID,
		RowNumber:       r.RowNumber,
		State:           r.State,
		NeedsYou:        blocksReconcile(r.State),
		StatementLine:   statementLine,
		AmountLabel:     centsLabel(r.ReceivedCents),
		PaidOnLabel:     travelDateLabel(str(r.PaidOn)),
		MatchLabel:      matchLabel,
		MatchHref:       matchHref,
		Note:            note,
		ConfidenceLabel: label,
		ConfidenceChip:  chip,
		DoneLabel:       doneLabel,
		ResolveHref:     statementPath(importID) + "/rows/" + r.RowID,
	}
}

// centsLabel is usd(): a missing figure stays missing rather than becoming $0.00.
func centsLabel(c *Cents) string {
	if c == nil {
		return ""
	}
	return cents2(*c)
}

// statementRowsView sorts needs-you first, then file order: the prototype's "3 need
// attention" at the top. A stable sort, so two rows that both need the advisor keep their
// file order.
func statementRowsView(rows []statementLineRow, importID string, reconciled bool) []statementRowItem {
	out := make([]statementRowItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, statementRowView(r, importID, reconciled))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].NeedsYou != out[j].NeedsYou {
			return out[i].NeedsYou
		}
		return out[i].RowNumber < out[j].RowNumber
	})
	return out
}

// ── Resolving one row ───────────────────────────────────────────────────────────────────

// candidateRow is one row of agent_commission_import_candidates.
type candidateRow struct {
	CommissionID  string  `json:"commission_id"`
	TripTitle     string  `json:"trip_title"`
	ClientName    string  `json:"client_name"`
	SupplierName  string  `json:"supplier_name"`
	StartDate     *string `json:"start_date"`
	ExpectedCents Cents   `json:"expected_cents"`
}

type candidateItem struct {
	CommissionID string
	Title        string
	Meta         string
	TravelLabel  string
}

func candidatesView(rows []candidateRow) []candidateItem {
	out := make([]candidateItem, 0, len(rows))
	for _, c := range rows {
		out = append(out, candidateItem{
			CommissionID: c.CommissionID,
			Title:        c.TripTitle,
			Meta:         statementCandidateMeta(c.SupplierName, c.ClientName, cents2(c.ExpectedCents)),
			TravelLabel:  travelDateLabel(str(c.StartDate)),
		})
	}
	return out
}

// impliedRate is the rate a new line needs for this row to pay it in full: (received + fee)
// / gross, rounded DOWN to two places. Rounded to NEAREST, $1,234.56 on $9,999.00 gave
// 12.35%, an expected of $1,234.88, and a new line born Disputed for 32 cents.
func impliedRate(received, fee, gross Cents) string {
	paid := int64(received) + int64(fee)
	// The multiply is where an int64 goes over, and this one is reachable from a statement's
	// own figures rather than from anything typed. Past that, there is no rate to offer.
	if gross <= 0 || paid < 0 || paid > maxPaidForRate {
		return ""
	}
	hundredths := paid * 10000 / int64(gross)
	return trimZeros(cents2Plain(hundredths))
}

// maxPaidForRate is where paid × 10000 stops fitting in an int64.
const maxPaidForRate = int64(1) << 49

// cents2Plain prints hundredths as a decimal with no currency and no grouping, which is what
// String(n / 100) gives in JavaScript before trimZeros takes the tail off.
func cents2Plain(hundredths int64) string {
	neg := hundredths < 0
	if neg {
		hundredths = -hundredths
	}
	out := itoa64(hundredths/100) + "." + pad2(hundredths%100)
	if neg {
		out = "-" + out
	}
	return out
}

func pad2(n int64) string {
	if n < 10 {
		return "0" + itoa64(n)
	}
	return itoa64(n)
}
