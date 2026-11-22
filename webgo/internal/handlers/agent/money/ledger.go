package money

import (
	"context"
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.7.2 — Commission Ledger: a port of loadCommissionLedger in
// web/lib/agent/commission.ts and app/(agent)/agent/commission/ledger/page.tsx.
//
// ONE ROW PER COMMISSION LINE, not per trip. A trip can carry several suppliers' lines, and
// most booked trips carry none yet — a trip with no line has not been invoiced, which is a
// state the advisor is in, not a gap in this list.

// ledgerPageSize matches agent_commission_ledger's own default so the two cannot drift.
const ledgerPageSize = 25

// ledgerRowData is one row of agent_commission_ledger.
type ledgerRowData struct {
	CommissionID            string  `json:"commission_id"`
	TripID                  string  `json:"trip_id"`
	TripTitle               string  `json:"trip_title"`
	TripArchived            bool    `json:"trip_archived"`
	ClientID                string  `json:"client_id"`
	ClientDisplayName       string  `json:"client_display_name"`
	SupplierID              string  `json:"supplier_id"`
	SupplierName            string  `json:"supplier_name"`
	StartDate               *string `json:"start_date"`
	EndDate                 *string `json:"end_date"`
	GrossBookingCents       Cents   `json:"gross_booking_cents"`
	CommissionPct           Rate    `json:"commission_pct"`
	ExpectedCommissionCents Cents   `json:"expected_commission_cents"`
	ProcessingFeeCents      Cents   `json:"processing_fee_cents"`
	ReceivedCommissionCents Cents   `json:"received_commission_cents"`
	Currency                string  `json:"currency"`
	Status                  string  `json:"status"`
	ReceivedAt              *string `json:"received_at"`
	InteletravelReference   *string `json:"inteletravel_reference"`
	AsOfDate                string  `json:"as_of_date"`
	TotalCount              int     `json:"total_count"`
}

// summaryRow is agent_commission_ledger_summary: the WHOLE ledger's counts, whatever else is
// filtered. They answer "how many lost lines do I have", not "how many in this view".
type summaryRow struct {
	ExpectedCount int `json:"expected_count"`
	InvoicedCount int `json:"invoiced_count"`
	ReceivedCount int `json:"received_count"`
	DisputedCount int `json:"disputed_count"`
	LostCount     int `json:"lost_count"`
	TotalCount    int `json:"total_count"`
}

type supplierRow struct {
	SupplierID   string `json:"supplier_id"`
	SupplierName string `json:"supplier_name"`
	LineCount    int    `json:"line_count"`
}

// ledgerRow is one line as the table draws it (LedgerRow).
type ledgerRow struct {
	CommissionID string
	// LineHref is §3.7.3: every row opens its line, archived trip or not.
	LineHref  string
	TripTitle string
	// TripHref is "" for an archived trip: its detail page will not open, so the title is
	// not a link.
	TripHref        string
	TripArchived    bool
	ClientName      string
	SupplierName    string
	TravelLabel     string
	GrossLabel      string
	RateLabel       string
	CommissionLabel string
	Status          string
	StatusChip      string
	StatusLabel     string
}

type ledgerSupplier struct {
	ID        string
	Name      string
	LineCount int
}

// commissionLedger is the screen (CommissionLedger).
type commissionLedger struct {
	Rows   []ledgerRow
	Counts map[string]int
	// Total is the lines matching the query, before the page window.
	Total     int
	Suppliers []ledgerSupplier
	// TripTitle is the trip's title when the ledger is filtered to one trip and has a row to
	// read it from.
	TripTitle string
	Page      int
	PageCount int
	PageSize  int
}

// toLedgerRow ports ledgerRow().
func toLedgerRow(r ledgerRowData) ledgerRow {
	// An unknown status is a schema change this screen has not caught up with. It renders as
	// itself on a colourless chip rather than borrowing another status's chip, which would
	// be a claim about the line.
	chip, label := "unknown", r.Status
	if known, ok := statusByValue(r.Status); ok {
		chip, label = known.Chip, known.Label
	}
	row := ledgerRow{
		CommissionID:    r.CommissionID,
		LineHref:        linePath(r.CommissionID),
		TripTitle:       r.TripTitle,
		TripArchived:    r.TripArchived,
		ClientName:      r.ClientDisplayName,
		SupplierName:    r.SupplierName,
		TravelLabel:     travelDateLabel(str(r.StartDate)),
		GrossLabel:      money(r.GrossBookingCents),
		RateLabel:       rateLabel(r.CommissionPct.Value),
		CommissionLabel: money(r.ExpectedCommissionCents),
		Status:          r.Status,
		StatusChip:      chip,
		StatusLabel:     label,
	}
	if !r.TripArchived {
		row.TripHref = "/agent/trips/" + url.PathEscape(r.TripID)
	}
	return row
}

// linePath is one line's own page (§3.7.3).
func linePath(commissionID string) string {
	return ledgerPath + "/" + url.PathEscape(commissionID)
}

// loadLedger reads the rows, the summary and the supplier list at once. nil means one of
// them failed; an empty ledger is a populated value with no rows.
func (a *app) loadLedger(ctx context.Context, v visit, q ledgerQuery) *commissionLedger {
	var (
		rows      []ledgerRowData
		summaries []summaryRow
		suppliers []supplierRow
	)
	args := map[string]any{
		"p_status":      nil,
		"p_supplier_id": nilable(q.SupplierID),
		"p_trip_id":     nilable(q.TripID),
		"p_travel_from": nilable(q.TravelFrom),
		"p_travel_to":   nilable(q.TravelTo),
		"p_limit":       ledgerPageSize,
		"p_offset":      (q.Page - 1) * ledgerPageSize,
	}
	if len(q.Statuses) > 0 {
		args["p_status"] = q.Statuses
	}
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_ledger", args, &rows)
	read(rs, "agent_commission_ledger_summary", map[string]any{}, &summaries)
	read(rs, "agent_commission_ledger_suppliers", map[string]any{}, &suppliers)
	if rs.wait() != nil {
		return nil
	}

	// total_count rides on every row and is the count BEFORE the page window. With no rows
	// there is nothing to read it off, and zero is the right answer anyway.
	total := 0
	if len(rows) > 0 {
		total = rows[0].TotalCount
	}
	out := &commissionLedger{
		Counts:    map[string]int{"expected": 0, "invoiced": 0, "received": 0, "disputed": 0, "lost": 0},
		Total:     total,
		Page:      q.Page,
		PageCount: max(1, ceilDiv(total, ledgerPageSize)),
		PageSize:  ledgerPageSize,
	}
	for _, r := range rows {
		out.Rows = append(out.Rows, toLedgerRow(r))
	}
	if len(summaries) > 0 {
		s := summaries[0]
		out.Counts["expected"] = s.ExpectedCount
		out.Counts["invoiced"] = s.InvoicedCount
		out.Counts["received"] = s.ReceivedCount
		out.Counts["disputed"] = s.DisputedCount
		out.Counts["lost"] = s.LostCount
	}
	for _, s := range suppliers {
		out.Suppliers = append(out.Suppliers, ledgerSupplier{ID: s.SupplierID, Name: s.SupplierName, LineCount: s.LineCount})
	}
	if q.TripID != "" && len(rows) > 0 {
		out.TripTitle = rows[0].TripTitle
	}
	return out
}

// nilable sends SQL NULL for an absent filter: an empty string is a value, and a uuid column
// handed one answers 400.
func nilable(v string) any {
	if v == "" {
		return nil
	}
	return v
}

// ceilDiv is Math.ceil(a / b) for whole numbers.
func ceilDiv(a, b int) int {
	if b <= 0 || a <= 0 {
		return 0
	}
	return (a + b - 1) / b
}

// ── The page ────────────────────────────────────────────────────────────────────────────

var ledgerSpec = page.Spec{
	File:   "agent/money/ledger.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"add-line", "export",
		"trip-chip", "trip-chip-label", "trip-chip-clear",
		"filter-form", "filter-trip",
		"supplier-select", "ledger-from", "ledger-to",
		"clear-filters",
		"empty", "empty-title", "empty-body",
		"table",
		"pager", "pager-range", "pager-prev", "pager-prev-off", "pager-next", "pager-next-off",
	),
	Repeats: map[string][]string{
		"status":    {"status-input", "status-label", "status-count"},
		"suppliers": {"supplier-option"},
		"line":      {"line-link", "line-title", "line-supplier-sr", "line-meta", "line-supplier", "line-travel", "line-gross", "line-rate", "line-comm", "line-status"},
	},
}

func (a *app) serveLedger(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	q := ledgerQueryFrom(r.URL.Query())
	var l *commissionLedger
	if v.canRead() {
		l = a.loadLedger(r.Context(), v, q)
	}
	// Past the last page — a bookmark or a stale tab, since the form never posts `page`. An
	// empty page carries no total_count to read, so it would claim "no commission lines yet"
	// over a ledger that has them. Start the same view from the top instead.
	if l != nil && len(l.Rows) == 0 && q.Page > 1 {
		web.SeeOther(w, r, q.withPage(1).href())
		return
	}
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case l == nil:
		st = stateRetry
	}
	doc := a.ledger.New()
	showContent := fillFrame(doc, r, v, st)
	if !v.noAccess {
		// The header is drawn whether or not the read answered, as the Next page draws it:
		// its actions are built from the QUERY, which a failed read does not take away.
		fillLedgerHeader(doc, q)
		if showContent {
			fillLedgerContent(doc, q, l)
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// fillLedgerHeader fills the two actions, which read only the query.
func fillLedgerHeader(doc *page.Doc, q ledgerQuery) {
	// §3.7.4 from the ledger: with the one-trip view's trip already chosen, if there is one.
	addLine := ledgerPath + "/new"
	if q.TripID != "" {
		addLine += "?trip=" + url.QueryEscape(q.TripID)
	}
	doc.URL("add-line", "href", addLine)
	doc.Keep("add-line")
	// The CURRENT filters ride along: the file is what the screen shows, all pages of it.
	doc.URL("export", "href", q.exportHref())
	doc.Keep("export")
}

func fillLedgerContent(doc *page.Doc, q ledgerQuery, l *commissionLedger) {
	if q.TripID == "" {
		doc.Remove("trip-chip")
		doc.Remove("filter-trip")
	} else {
		doc.Keep("trip-chip")
		// The title is read off a row, so a narrowed view with no rows has none to show.
		// Rather than a dangling "One trip:", the chip then says what it filters by.
		if l.TripTitle == "" {
			doc.Text("trip-chip-label", copyTripFilterUnnamed)
		} else {
			doc.Text("trip-chip-label", copyTripFilterPrefix+" "+l.TripTitle)
		}
		doc.URL("trip-chip-clear", "href", q.withoutTrip().href())
		doc.Keep("trip-chip-clear")
		// Narrowing a one-trip view by status should not quietly widen it back to every trip.
		doc.Attr("filter-trip", "value", q.TripID)
	}
	doc.Keep("filter-form")

	picked := map[string]bool{}
	for _, s := range q.Statuses {
		picked[s] = true
	}
	doc.Repeat("status", len(commissionStatusFilters), func(i int, row *page.Row) {
		f := commissionStatusFilters[i]
		row.Attr("status-input", "value", f.Value)
		row.Bool("status-input", "checked", picked[f.Value])
		row.Text("status-label", f.Label)
		row.Text("status-count", itoa(l.Counts[f.Value]))
	})

	doc.Keep("supplier-select")
	doc.Repeat("suppliers", len(l.Suppliers), func(i int, row *page.Row) {
		s := l.Suppliers[i]
		// An <option> holds no elements, so the repeat's row IS the option: its own slot.
		row.Attr("supplier-option", "value", s.ID)
		row.Text("supplier-option", s.Name+" ("+itoa(s.LineCount)+")")
		row.Bool("supplier-option", "selected", s.ID == q.SupplierID)
	})
	doc.Attr("ledger-from", "value", q.TravelFrom)
	doc.Attr("ledger-to", "value", q.TravelTo)

	// Clears what THIS form sets. The one-trip view has its own "Show every trip" link, so
	// clearing a status here keeps the advisor on that trip.
	if q.withoutTrip().isFiltered() {
		doc.Keep("clear-filters")
		doc.URL("clear-filters", "href", q.onlyTrip().href())
	} else {
		doc.Remove("clear-filters")
	}

	if len(l.Rows) == 0 {
		doc.Remove("table")
		doc.Remove("pager")
		doc.Keep("empty")
		// Order matters. A one-trip view narrowed further (a status, a supplier, dates) that
		// comes back empty is "nothing matches", not "this trip has no lines" — it may have
		// several.
		switch {
		case q.withoutTrip().isFiltered():
			doc.Text("empty-title", copyEmptyFilteredTitle)
			doc.Text("empty-body", copyEmptyFilteredBody)
		case q.TripID != "":
			doc.Text("empty-title", copyEmptyTripTitle)
			doc.Text("empty-body", copyEmptyTripBody)
		default:
			doc.Text("empty-title", copyEmptyTitle)
			doc.Text("empty-body", copyEmptyBody)
		}
		// The table held the row sample, so removing it took the repeat with it.
		return
	}

	doc.Remove("empty")
	doc.Keep("table")
	doc.Repeat("line", len(l.Rows), func(i int, row *page.Row) {
		r := l.Rows[i]
		// Each row opens its LINE. The link is the trip title in the row header, so the
		// row's accessible name is the trip; Trip Detail is one click further.
		row.URL("line-link", "href", r.LineHref)
		row.Keep("line-link")
		row.Text("line-title", r.TripTitle)
		row.Attr("line-title", "title", r.TripTitle)
		// Two suppliers on one trip are two links; the supplier tells them apart for anyone
		// who cannot see the Supplier column.
		row.Text("line-supplier-sr", " · "+r.SupplierName)
		meta := r.ClientName
		if r.TripArchived {
			meta += " · " + copyArchivedTrip
		}
		row.Text("line-meta", meta)
		row.Text("line-supplier", r.SupplierName)
		travel := r.TravelLabel
		if travel == "" {
			travel = copyNoDates
		}
		row.Text("line-travel", travel)
		row.Text("line-gross", r.GrossLabel)
		row.Text("line-rate", r.RateLabel)
		row.Text("line-comm", r.CommissionLabel)
		row.Text("line-status", r.StatusLabel)
		// Written out rather than built from the kind: a class name assembled from data is
		// one the class-allowlist test cannot see, and an unknown status must stay
		// colourless rather than borrow another's chip.
		switch r.StatusChip {
		case "inquiry":
			row.Class("line-status", "status-inquiry", true)
		case "proposal":
			row.Class("line-status", "status-proposal", true)
		case "booked":
			row.Class("line-status", "status-booked", true)
		case "due":
			row.Class("line-status", "status-due", true)
		case "past":
			row.Class("line-status", "status-past", true)
		}
	})
	fillPager(doc, q, l)
}

// fillPager is RosterPagination: server-rendered links that carry the filters forward. It
// draws nothing at all when there is one page.
func fillPager(doc *page.Doc, q ledgerQuery, l *commissionLedger) {
	if l.PageCount <= 1 {
		doc.Remove("pager")
		return
	}
	doc.Keep("pager")
	first := (l.Page-1)*l.PageSize + 1
	last := first + len(l.Rows) - 1
	doc.Text("pager-range", itoa(first)+"–"+itoa(last)+" of "+itoa(l.Total))
	if l.Page > 1 {
		doc.Keep("pager-prev")
		doc.URL("pager-prev", "href", q.withPage(l.Page-1).href())
		doc.Remove("pager-prev-off")
	} else {
		doc.Remove("pager-prev")
		doc.Keep("pager-prev-off")
	}
	if l.Page < l.PageCount {
		doc.Keep("pager-next")
		doc.URL("pager-next", "href", q.withPage(l.Page+1).href())
		doc.Remove("pager-next-off")
	} else {
		doc.Remove("pager-next")
		doc.Keep("pager-next-off")
	}
}
