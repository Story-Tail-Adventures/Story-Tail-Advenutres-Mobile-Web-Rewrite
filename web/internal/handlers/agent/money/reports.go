package money

import (
	"context"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// §3.11 Reporting — a port of web/app/(agent)/agent/reports/ and lib/agent/reports.ts.
//
// EVERY CONTROL IS A LINK. The period, the revenue basis, the compare switch and the client
// cohort are all in the query, so a report is shareable, the back button works, and the page
// needs no client state. The price is the one #216 and #217 both paid: anything a fill reads
// off the query must be on every link that can land back on that fill.
//
// THE CHARTS ARE BOXES, NOT A CHART LIBRARY (§3.11's ruling), and every one has a plain
// table under it carrying the same figures — which is also what the Export downloads.
//
// A read that FAILED is the retry state, never an empty report: "$0" and "couldn't load"
// are different answers, and the §3.11 screens are the ones an advisor does their taxes from.

// reportWindow is the period's dates and its caption.
type reportWindow struct {
	From       string
	To         string
	Today      string
	RangeLabel string
}

// periodRow is agent_report_period's single row.
type periodRow struct {
	FromDate string `json:"from_date"`
	ToDate   string `json:"to_date"`
	Today    string `json:"today"`
}

func windowOf(rows []periodRow) *reportWindow {
	if len(rows) == 0 {
		return nil
	}
	r := rows[0]
	return &reportWindow{
		From: r.FromDate, To: r.ToDate, Today: r.Today,
		RangeLabel: periodRangeLabel(r.FromDate, r.ToDate),
	}
}

// ── The shell every report shares ───────────────────────────────────────────────────────

// reportShell is ReportShell's data. A zero field means the page does not carry that slot:
// the three reports without a period draw no chips and no window line, and the Export
// Center IS the export, so it has no Export button.
type reportShell struct {
	// Subtitle is filled only where it is a FIGURE (the funnel's summary, the lead count);
	// every other report's subtitle is the page's own words.
	Subtitle    string
	HasSubtitle bool
	Window      string
	HasWindow   bool
	Chips       []periodChip
	ExportHref  string
}

func fillReportShell(doc *page.Doc, s reportShell) {
	if s.HasSubtitle {
		textOrRemove(doc, "rpt-subtitle", s.Subtitle)
	}
	if s.HasWindow {
		textOrRemove(doc, "rpt-window", s.Window)
	}
	if s.ExportHref != "" {
		doc.URL("rpt-export", "href", s.ExportHref)
		doc.Keep("rpt-export")
	}
	if len(s.Chips) > 0 {
		doc.Repeat("chip", len(s.Chips), func(i int, row *page.Row) {
			c := s.Chips[i]
			row.URL("chip-link", "href", c.Href)
			row.Text("chip-label", c.Label)
			row.Class("chip-link", "chip-secondary", c.Selected)
			row.Class("chip-link", "chip-outlined", !c.Selected)
			if c.Selected {
				// Heard as well as seen: the chip row is a nav, so the current one says so.
				row.Attr("chip-link", "aria-current", "true")
			}
		})
	}
}

// chipRepeat is the shell's one repeat, for the Specs that carry a period chip row.
var chipRepeat = []string{"chip-link", "chip-label"}

// ── 3.11.1 Hub ──────────────────────────────────────────────────────────────────────────

// The hub is eight tiles and every report is built, so it has nothing to fill but the
// frame: BUILT_REPORTS covers all eight, and "On its way" never shows.
var reportsHubSpec = page.Spec{
	File:   "agent/money/reports.html",
	Layout: shell.Agent,
	Slots:  withFrame(),
}

func (a *app) serveReportsHub(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	st := stateBody
	if v.noAccess {
		st = stateNoAccess
	}
	doc := a.reportsHub.New()
	fillFrame(doc, r, v, st)
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── The loaders ─────────────────────────────────────────────────────────────────────────
//
// nil means the READ failed, or the caller is not an advisor (no period row). An advisor
// with nothing in the period gets a populated, empty report, never nil.

func (a *app) loadRevenue(ctx context.Context, v visit, period, basis string) (*reportWindow, *revenueReportView) {
	var (
		periods []periodRow
		rows    []revenueRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": period}, &periods)
	read(rs, "agent_report_revenue_by_month", map[string]any{"p_period": period, "p_basis": basis}, &rows)
	if rs.wait() != nil {
		return nil, nil
	}
	win := windowOf(periods)
	if win == nil {
		return nil, nil
	}
	return win, revenueReport(rows, win.Today)
}

func (a *app) loadSupplierReport(ctx context.Context, v visit, period string) (*reportWindow, *supplierReportView) {
	var (
		periods []periodRow
		rows    []supplierReportRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": period}, &periods)
	read(rs, "agent_report_commission_by_supplier", map[string]any{"p_period": period}, &rows)
	if rs.wait() != nil {
		return nil, nil
	}
	win := windowOf(periods)
	if win == nil {
		return nil, nil
	}
	return win, supplierReport(rows, win.From, win.To)
}

func (a *app) loadDestinationReport(ctx context.Context, v visit, period string) (*reportWindow, *destinationReportView) {
	var (
		periods []periodRow
		rows    []destinationRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": period}, &periods)
	read(rs, "agent_report_top_destinations", map[string]any{"p_period": period}, &rows)
	if rs.wait() != nil {
		return nil, nil
	}
	win := windowOf(periods)
	if win == nil {
		return nil, nil
	}
	return win, destinationReport(rows, copyNoDestination)
}

// loadClientReport takes no period: lifetime value is lifetime. The period read is still
// made, as the "is this an advisor" tell, so a traveler gets the retry screen rather than an
// empty ranking.
func (a *app) loadClientReport(ctx context.Context, v visit, cohort string) *clientReportView {
	var (
		periods []periodRow
		rows    []clientValueRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": "ytd"}, &periods)
	read(rs, "agent_report_client_lifetime_value", map[string]any{}, &rows)
	if rs.wait() != nil || len(periods) == 0 {
		return nil
	}
	return clientReport(rows, cohort)
}

func (a *app) loadFunnelReport(ctx context.Context, v visit, period string) (*reportWindow, *funnelReportView) {
	var (
		periods []periodRow
		rows    []funnelRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": period}, &periods)
	read(rs, "agent_report_conversion_funnel", map[string]any{"p_period": period}, &rows)
	if rs.wait() != nil {
		return nil, nil
	}
	win := windowOf(periods)
	if win == nil {
		return nil, nil
	}
	return win, funnelReport(rows)
}

// loadPipelineReport is today's pipeline: no period. The period read is only the tell.
func (a *app) loadPipelineReport(ctx context.Context, v visit) *pipelineReportView {
	var (
		periods []periodRow
		stages  []pipelineStageRow
		months  []pipelineMonthRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": "ytd"}, &periods)
	read(rs, "agent_report_pipeline_stages", map[string]any{}, &stages)
	read(rs, "agent_report_pipeline_months", map[string]any{}, &months)
	if rs.wait() != nil || len(periods) == 0 {
		return nil
	}
	return pipelineReport(stages, months)
}

// exportCenter is 3.11.8's two pieces: today, for the form's default range, and the recent
// exports.
type exportCenter struct {
	Today   string
	History []exportHistoryItem
}

func (a *app) loadExportCenter(ctx context.Context, v visit) *exportCenter {
	var (
		periods []periodRow
		rows    []exportHistoryRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": "ytd"}, &periods)
	read(rs, "agent_export_history", map[string]any{"p_limit": 20}, &rows)
	if rs.wait() != nil || len(periods) == 0 {
		return nil
	}
	statuses := make([]string, 0, len(commissionStatusFilters))
	for _, f := range commissionStatusFilters {
		statuses = append(statuses, f.Value)
	}
	return &exportCenter{Today: periods[0].Today, History: exportHistory(rows, statuses)}
}

func (a *app) loadLeadSourcesReport(ctx context.Context, v visit, period string) (*reportWindow, *leadSourcesReportView) {
	var (
		periods   []periodRow
		sources   []leadSourceRow
		campaigns []leadCampaignRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_report_period", map[string]any{"p_period": period}, &periods)
	read(rs, "agent_report_lead_sources", map[string]any{"p_period": period}, &sources)
	read(rs, "agent_report_lead_campaigns", map[string]any{"p_period": period}, &campaigns)
	if rs.wait() != nil {
		return nil, nil
	}
	win := windowOf(periods)
	if win == nil {
		return nil, nil
	}
	return win, leadSourcesReport(sources, campaigns)
}

// reportState is what a report handler decides before it renders: which of the frame's
// states, and the HTTP status that goes with it.
func reportState(v visit, loaded bool) state {
	switch {
	case v.noAccess:
		return stateNoAccess
	case !loaded:
		return stateRetry
	}
	return stateBody
}
