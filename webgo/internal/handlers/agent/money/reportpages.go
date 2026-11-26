package money

import (
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The eight §3.11 screens. Each is the same shape: read the state off the query, load, pick
// the frame's state, fill the shell (which a failed read KEEPS, so the advisor can still move
// somewhere else), then fill the content.

// ── 3.11.2 Revenue by Month ─────────────────────────────────────────────────────────────

var revenueSpec = page.Spec{
	File:   "agent/money/reports-revenue.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"rpt-window", "rpt-export",
		"basis-booked", "basis-received", "compare-link", "compare-text",
		"rev-total", "rev-total-caption", "rev-change", "rev-change-label", "rev-empty",
		"rev-legend", "rev-col-amount", "rev-col-count", "rev-col-prior",
		"rev-note", "rev-tracking",
	),
	Repeats: map[string][]string{
		"chip":    chipRepeat,
		"rev-bar": {"rev-col", "rev-prior-bar", "rev-bar", "rev-bar-label"},
		"rev-row": {"rev-row-month", "rev-row-amount", "rev-row-count", "rev-row-prior"},
	},
}

func (a *app) serveRevenue(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	q := r.URL.Query()
	period, basis, compare := readPeriod(q.Get("period")), readBasis(q.Get("basis")), readCompare(q.Get("compare"))

	var (
		win *reportWindow
		rep *revenueReportView
	)
	if v.canRead() {
		win, rep = a.loadRevenue(r.Context(), v, period, basis)
	}
	st := reportState(v, rep != nil)

	doc := a.revenue.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	window := ""
	if win != nil {
		window = win.RangeLabel
	}
	fillReportShell(doc, reportShell{
		Window: window, HasWindow: true,
		Chips:      periodChips("revenue", period, basis, compare),
		ExportHref: reportExportHref("revenue", period, basis),
	})
	if show {
		fillRevenue(doc, rep, period, basis, compare)
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

func fillRevenue(doc *page.Doc, rep *revenueReportView, period, basis string, compare bool) {
	// The basis chips and the compare switch sit INSIDE the content, as the Next page puts
	// them: a read that failed takes them with it, and nothing here can touch a slot the
	// frame has already removed. Each link keeps every other piece of state, or the advisor
	// loses their place on a click.
	doc.URL("basis-booked", "href", reportStateHref("revenue", period, "booked", compare))
	doc.Keep("basis-booked")
	doc.Class("basis-booked", "chip-primary", basis == "booked")
	doc.Class("basis-booked", "chip-outlined", basis != "booked")
	doc.URL("basis-received", "href", reportStateHref("revenue", period, "received", compare))
	doc.Keep("basis-received")
	doc.Class("basis-received", "chip-primary", basis == "received")
	doc.Class("basis-received", "chip-outlined", basis != "received")
	if basis == "booked" {
		doc.Attr("basis-booked", "aria-current", "true")
	} else {
		doc.Attr("basis-received", "aria-current", "true")
	}

	// The compare link appears only once there IS a last year: a comparison against no data
	// is a broken number (§3.11).
	if rep.HasPrior {
		doc.Keep("compare-link")
		doc.URL("compare-link", "href", reportStateHref("revenue", period, basis, !compare))
		if compare {
			doc.Text("compare-text", copyCompareHide)
		} else {
			doc.Text("compare-text", copyCompareShow)
		}
	} else {
		doc.Remove("compare-link")
	}

	showPrior := compare && rep.HasPrior
	booked := basis == "booked"

	doc.Text("rev-total", rep.TotalLabel)
	doc.Text("rev-total-caption", reportTotalFor(periodNames[period]))
	// The chip's padding lives on its inner .chip-label, so the text goes in the SPAN: Text
	// on the chip itself would replace that span and the words would sit on the border.
	if rep.Change == "" {
		doc.Remove("rev-change")
	} else {
		doc.Keep("rev-change")
		doc.Text("rev-change-label", rep.Change)
	}

	if rep.Empty {
		doc.Keep("rev-empty")
		if booked {
			doc.Text("rev-empty", copyRevenueEmptyBooked)
		} else {
			doc.Text("rev-empty", copyRevenueEmptyRecvd)
		}
	} else {
		doc.Remove("rev-empty")
	}

	if showPrior {
		doc.Keep("rev-legend")
	} else {
		doc.Remove("rev-legend")
	}

	doc.Repeat("rev-bar", len(rep.Months), func(i int, row *page.Row) {
		m := rep.Months[i]
		title := m.LongLabel + ": " + m.AmountLabel
		if showPrior && m.HasPrior {
			title += " (last year " + m.PriorLabel + ")"
		}
		row.Attr("rev-col", "title", title)
		row.Keep("rev-col")
		if showPrior {
			row.Keep("rev-prior-bar")
			row.Attr("rev-prior-bar", "data-h", heightStep(m.PriorHeightPct))
		} else {
			row.Remove("rev-prior-bar")
		}
		row.Keep("rev-bar")
		row.Attr("rev-bar", "data-h", heightStep(m.HeightPct))
		// Beside last year's bar each is half as wide, as the artboard draws the pair.
		row.Class("rev-bar", "mny-bar-paired", showPrior)
		row.Class("rev-bar", "mny-bar-current", m.IsCurrent)
		row.Text("rev-bar-label", m.Label)
	})

	if booked {
		doc.Text("rev-col-amount", copyColBooked)
		doc.Text("rev-col-count", copyColTrips)
	} else {
		doc.Text("rev-col-amount", copyColReceived)
		doc.Text("rev-col-count", copyColPayments)
	}
	if rep.HasPrior {
		doc.Keep("rev-col-prior")
	} else {
		doc.Remove("rev-col-prior")
	}

	// Newest first in the table: the month the advisor is in is the one they look for.
	doc.Repeat("rev-row", len(rep.Months), func(i int, row *page.Row) {
		m := rep.Months[len(rep.Months)-1-i]
		row.Text("rev-row-month", m.LongLabel)
		row.Text("rev-row-amount", m.AmountLabel)
		row.Text("rev-row-count", m.CountLabel)
		if !rep.HasPrior {
			row.Remove("rev-row-prior")
			return
		}
		row.Keep("rev-row-prior")
		if m.HasPrior {
			row.Text("rev-row-prior", m.PriorLabel)
		} else {
			// Not $0, which would be a claim about a month nothing was recorded in.
			row.Text("rev-row-prior", noFigure)
		}
	})

	if booked {
		doc.Text("rev-note", copyRevenueBookedNote)
		doc.Keep("rev-tracking")
	} else {
		doc.Text("rev-note", copyRevenueReceivedNote)
		doc.Remove("rev-tracking")
	}
}

// ── 3.11.3 Commission by Supplier ───────────────────────────────────────────────────────

var suppliersSpec = page.Spec{
	File:   "agent/money/reports-suppliers.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"rpt-window", "rpt-export",
		"sup-empty", "sup-table", "sup-total-received", "sup-total-owed", "sup-setaside",
	),
	Repeats: map[string][]string{
		"chip": chipRepeat,
		"sup-row": {
			"sup-link", "sup-name", "sup-bar", "sup-received-bar",
			"sup-received", "sup-owed", "sup-share",
		},
	},
}

func (a *app) serveSuppliers(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	period := readPeriod(r.URL.Query().Get("period"))
	var (
		win *reportWindow
		rep *supplierReportView
	)
	if v.canRead() {
		win, rep = a.loadSupplierReport(r.Context(), v, period)
	}
	st := reportState(v, rep != nil)

	doc := a.suppliers.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	window := ""
	if win != nil {
		window = win.RangeLabel
	}
	fillReportShell(doc, reportShell{
		Window: window, HasWindow: true,
		Chips:      periodChips("suppliers", period, "", false),
		ExportHref: reportExportHref("suppliers", period, ""),
	})
	if show {
		if rep.Empty {
			doc.Keep("sup-empty")
			// The table holds the repeat and the footer; removing it handles both, so
			// nothing below may touch them.
			doc.Remove("sup-table")
		} else {
			doc.Remove("sup-empty")
			doc.Keep("sup-table")
			doc.Text("sup-total-received", rep.ReceivedTotalLabel)
			doc.Text("sup-total-owed", rep.OwedTotalLabel)
			doc.Repeat("sup-row", len(rep.Rows), func(i int, row *page.Row) {
				s := rep.Rows[i]
				row.URL("sup-link", "href", s.Href)
				row.Text("sup-name", s.Name)
				row.Keep("sup-bar")
				row.Attr("sup-bar", "data-w", meterStep(s.SharePct))
				row.Keep("sup-received-bar")
				row.Attr("sup-received-bar", "data-w", meterStep(s.ReceivedPct))
				row.Text("sup-received", s.ReceivedLabel)
				row.Text("sup-owed", s.OwedLabel)
				row.Text("sup-share", s.ShareLabel)
			})
		}
		textOrRemove(doc, "sup-setaside", rep.SetAsideNote)
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── 3.11.4 Top Destinations ─────────────────────────────────────────────────────────────

var destinationsSpec = page.Spec{
	File:   "agent/money/reports-destinations.html",
	Layout: shell.Agent,
	Slots:  withFrame("rpt-window", "rpt-export", "dest-empty", "dest-table", "dest-total"),
	Repeats: map[string][]string{
		"chip":     chipRepeat,
		"dest-row": {"dest-name", "dest-bar", "dest-trips", "dest-value"},
	},
}

func (a *app) serveDestinations(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	period := readPeriod(r.URL.Query().Get("period"))
	var (
		win *reportWindow
		rep *destinationReportView
	)
	if v.canRead() {
		win, rep = a.loadDestinationReport(r.Context(), v, period)
	}
	st := reportState(v, rep != nil)

	doc := a.destinations.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	window := ""
	if win != nil {
		window = win.RangeLabel
	}
	fillReportShell(doc, reportShell{
		Window: window, HasWindow: true,
		Chips:      periodChips("destinations", period, "", false),
		ExportHref: reportExportHref("destinations", period, ""),
	})
	if show {
		if rep.Empty {
			doc.Keep("dest-empty")
			doc.Remove("dest-table")
		} else {
			doc.Remove("dest-empty")
			doc.Keep("dest-table")
			doc.Text("dest-total", rep.TotalLabel)
			doc.Repeat("dest-row", len(rep.Rows), func(i int, row *page.Row) {
				d := rep.Rows[i]
				row.Text("dest-name", d.Name)
				row.Class("dest-name", "mny-rpt-unnamed", d.Unnamed)
				row.Keep("dest-bar")
				row.Attr("dest-bar", "data-w", meterStep(d.SharePct))
				row.Class("dest-bar", "mny-rpt-bar-quiet", d.Unnamed)
				row.Text("dest-trips", d.TripsLabel)
				row.Text("dest-value", d.ValueLabel)
			})
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── 3.11.5 Client Lifetime Value ────────────────────────────────────────────────────────

var clientsSpec = page.Spec{
	File:   "agent/money/reports-clients.html",
	Layout: shell.Agent,
	Slots:  withFrame("rpt-export", "cli-cohorts", "cli-empty", "cli-empty-text", "cli-table"),
	Repeats: map[string][]string{
		"cohort":  {"cohort-link", "cohort-label"},
		"cli-row": {"cli-rank", "cli-link", "cli-name", "cli-trips", "cli-value", "cli-comm", "cli-cohort"},
	},
}

func (a *app) serveClientValue(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	cohort := readCohort(r.URL.Query().Get("cohort"))
	var rep *clientReportView
	if v.canRead() {
		rep = a.loadClientReport(r.Context(), v, cohort)
	}
	st := reportState(v, rep != nil)

	doc := a.clientValue.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	// The Export downloads the whole ranking, whatever cohort is on screen.
	fillReportShell(doc, reportShell{ExportHref: reportExportHref("clients", "", "")})
	if show {
		if rep.Empty {
			// No cohorts to choose between, and the chips sit inside the nav the repeat is in.
			doc.Remove("cli-cohorts")
		} else {
			doc.Keep("cli-cohorts")
			doc.Repeat("cohort", len(rep.Cohorts), func(i int, row *page.Row) {
				c := rep.Cohorts[i]
				row.URL("cohort-link", "href", c.Href)
				row.Text("cohort-label", c.Label)
				row.Class("cohort-link", "chip-primary", c.Selected)
				row.Class("cohort-link", "chip-outlined", !c.Selected)
				if c.Selected {
					row.Attr("cohort-link", "aria-current", "true")
				}
			})
		}
		if len(rep.Rows) == 0 {
			// The sentence goes in its own slot INSIDE the card: Text on the card would
			// replace its padded body with a bare string.
			doc.Keep("cli-empty")
			if rep.Empty {
				doc.Text("cli-empty-text", copyClientsEmpty)
			} else {
				doc.Text("cli-empty-text", copyClientsCohortEmpty)
			}
			doc.Remove("cli-table")
		} else {
			doc.Remove("cli-empty")
			doc.Keep("cli-table")
			doc.Repeat("cli-row", len(rep.Rows), func(i int, row *page.Row) {
				c := rep.Rows[i]
				row.Text("cli-rank", itoa(c.Rank))
				row.URL("cli-link", "href", c.Href)
				row.Text("cli-name", c.Name)
				row.Text("cli-trips", c.TripsLabel)
				row.Text("cli-value", c.ValueLabel)
				row.Text("cli-comm", c.CommissionLabel)
				row.Text("cli-cohort", c.CohortLabel)
			})
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── 3.11.6 Conversion Funnel ────────────────────────────────────────────────────────────

var funnelSpec = page.Spec{
	File:   "agent/money/reports-funnel.html",
	Layout: shell.Agent,
	Slots:  withFrame("rpt-subtitle", "rpt-window", "rpt-export", "fun-empty", "fun-card", "fun-bookdays"),
	Repeats: map[string][]string{
		"chip":      chipRepeat,
		"fun-stage": {"fun-label", "fun-bar", "fun-trips", "fun-pct", "fun-stopped"},
		"fun-row":   {"fun-row-stage", "fun-row-reached", "fun-row-pct", "fun-row-open", "fun-row-cancelled"},
	},
}

// funnelTone is the artboard's colouring: Inquiry on the primary container, the middle
// stages on secondary, Traveled on success, and a stage nobody reached left plain.
func funnelTone(i, last int, reached int) string {
	switch {
	case reached == 0:
		return "mny-fun-none"
	case i == 0:
		return "mny-fun-first"
	case i == last:
		return "mny-fun-last"
	}
	return "mny-fun-mid"
}

func (a *app) serveFunnel(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	period := readPeriod(r.URL.Query().Get("period"))
	var (
		win *reportWindow
		rep *funnelReportView
	)
	if v.canRead() {
		win, rep = a.loadFunnelReport(r.Context(), v, period)
	}
	st := reportState(v, rep != nil)

	doc := a.funnel.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	window, subtitle := "", ""
	if win != nil {
		window = win.RangeLabel
	}
	if rep != nil {
		// The subtitle IS the summary, as the artboard draws it.
		subtitle = rep.Summary
	}
	fillReportShell(doc, reportShell{
		Subtitle: subtitle, HasSubtitle: true,
		Window: window, HasWindow: true,
		Chips:      periodChips("funnel", period, "", false),
		ExportHref: reportExportHref("funnel", period, ""),
	})
	if show {
		if rep.Empty {
			doc.Keep("fun-empty")
			doc.Remove("fun-card")
		} else {
			doc.Remove("fun-empty")
			doc.Keep("fun-card")
			doc.Text("fun-bookdays", rep.BookDaysLabel)
			last := len(rep.Stages) - 1
			doc.Repeat("fun-stage", len(rep.Stages), func(i int, row *page.Row) {
				s := rep.Stages[i]
				row.Text("fun-label", s.Label)
				row.Keep("fun-bar")
				row.Attr("fun-bar", "data-w", s.PctWidth)
				row.Class("fun-bar", funnelTone(i, last, s.Reached), true)
				row.Text("fun-trips", funnelTrips(s.Reached))
				row.Text("fun-pct", s.PctLabel)
				// KEPT even when empty: the span is flex: 0 0 190px, so removing it would
				// widen that row's track and draw its bar against a different 100%.
				row.Keep("fun-stopped")
				row.Text("fun-stopped", s.StoppedLabel)
			})
			doc.Repeat("fun-row", len(rep.Stages), func(i int, row *page.Row) {
				s := rep.Stages[i]
				row.Text("fun-row-stage", s.Label)
				row.Text("fun-row-reached", s.ReachedLabel)
				row.Text("fun-row-pct", s.PctLabel)
				// Nobody "stops" at the last stage: it is the end of the road.
				if s.Last {
					row.Text("fun-row-open", noFigure)
					row.Text("fun-row-cancelled", noFigure)
					return
				}
				row.Text("fun-row-open", itoa(s.OpenHere))
				row.Text("fun-row-cancelled", itoa(s.CancelledHere))
			})
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── 3.11.7 Pipeline Value ───────────────────────────────────────────────────────────────

const pipelinePath = "/agent/reports/pipeline"

var pipelineSpec = page.Spec{
	File:   "agent/money/reports-pipeline.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"rpt-export",
		"pip-empty", "pip-gross", "pip-open-sub", "pip-weighted",
		"adjust", "weights-form", "form-error", "form-error-text", "weights-hint",
	),
	Repeats: map[string][]string{
		"stage": {
			"stage-label", "stage-trips", "stage-bar", "stage-pct", "stage-pct-text",
			"stage-input", "stage-input-label", "stage-expected", "stage-amount",
		},
		"pip-month": {"pip-month-label", "pip-month-bar-cell", "pip-month-bar", "pip-month-amount"},
	},
}

func (a *app) servePipeline(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	var rep *pipelineReportView
	if v.canRead() {
		rep = a.loadPipelineReport(r.Context(), v)
	}
	a.renderPipeline(w, r, v, rep, r.URL.Query().Get("edit") == "1", "", http.StatusOK, nil)
}

// savePipelineWeights is the pipeline's own "Save weights". ONE SET OF WEIGHTS: these are
// §3.7.7's pipeline_weight rows, edited here over GROSS value, and saving changes the
// commission forecast and the worklist's confidence too.
func (a *app) savePipelineWeights(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	form, ok := web.Form(w, r)
	if !ok {
		return
	}
	reRender := func(message string) {
		var rep *pipelineReportView
		if v.canRead() {
			rep = a.loadPipelineReport(r.Context(), v)
		}
		a.renderPipeline(w, r, v, rep, true, message, http.StatusUnprocessableEntity, form)
	}

	weights, expected, ok := weightsFromForm(form)
	if !ok {
		reRender(copyWeightsInvalid)
		return
	}
	res := a.call(r, v, "agent-commission", map[string]any{
		"op": "weights", "weights": weights, "expected": expected,
	})
	if out := web.FromResult(res, copySaveFailed); !out.OK {
		if out.SignIn {
			web.SeeOther(w, r, "/login?next="+url.QueryEscape(pipelinePath))
			return
		}
		// Staleness is read off conflict, never off the function's English.
		msg := copySaveFailed
		if out.Conflict {
			msg = copyWeightsStale
		}
		reRender(msg)
		return
	}
	web.SeeOther(w, r, pipelinePath)
}

func (a *app) renderPipeline(w http.ResponseWriter, r *http.Request, v visit, rep *pipelineReportView, editing bool, message string, status int, typed url.Values) {
	st := reportState(v, rep != nil)
	code := statusFor(st)
	doc := a.pipeline.New()
	show := fillFrame(doc, r, v, st)
	if !v.noAccess {
		fillReportShell(doc, reportShell{ExportHref: reportExportHref("pipeline", "", "")})
		if show {
			fillPipeline(doc, rep, editing, message, typed)
			// A refusal re-renders the page it was posted from, so it answers with the
			// refusal's status; a plain GET is a 200.
			code = status
		}
	}
	web.Render(w, a.d.Log, doc, code, web.Private)
}

func fillPipeline(doc *page.Doc, rep *pipelineReportView, editing bool, message string, typed url.Values) {
	if rep.Empty {
		doc.Keep("pip-empty")
	} else {
		doc.Remove("pip-empty")
	}
	doc.Text("pip-gross", rep.GrossLabel)
	doc.Text("pip-open-sub", rep.OpenSub)
	doc.Text("pip-weighted", rep.WeightedLabel)

	if editing {
		doc.Remove("adjust")
		doc.Keep("weights-form")
		doc.Keep("weights-hint")
	} else {
		doc.Keep("adjust")
		doc.URL("adjust", "href", pipelinePath+"?edit=1")
		doc.Remove("weights-form")
	}
	if message != "" {
		doc.Keep("form-error")
		doc.Text("form-error-text", message)
	} else {
		doc.Remove("form-error")
	}

	doc.Repeat("stage", len(rep.Stages), func(i int, row *page.Row) {
		fillStageRow(row, rep.Stages[i], editing, typed)
	})

	doc.Repeat("pip-month", len(rep.Months), func(i int, row *page.Row) {
		m := rep.Months[i]
		row.Text("pip-month-label", m.Label)
		row.Class("pip-month-label", "mny-pip-extra", m.Extra)
		row.Text("pip-month-amount", m.AmountLabel)
		if m.Extra {
			// The set-apart rows wrap across the bar's column rather than drawing a bar
			// against a scale they are not on.
			row.Remove("pip-month-bar-cell")
			row.Attr("pip-month-label", "colspan", "2")
			return
		}
		row.Keep("pip-month-bar-cell")
		row.Keep("pip-month-bar")
		row.Attr("pip-month-bar", "data-w", meterStep(m.BarPct))
	})
}

// fillStageRow is the weights card's row, shared with §3.7.7's own fill: the same rows, the
// same names, and the same "what I saw" hidden field.
//
// typed is the REFUSED submission, or nil on a plain GET. A refusal re-renders from a fresh
// read, so without this one bad field would wipe the other three — and the hidden `expected`
// would be refreshed too, which quietly turns a stale save into a successful overwrite. Both
// come back exactly as they were sent.
func fillStageRow(row *page.Row, s stageView, editing bool, typed url.Values) {
	value, expected := itoa(s.WeightPct), itoa(s.WeightPct)
	if typed != nil {
		if v, ok := typed["weight-"+s.Stage]; ok && len(v) > 0 {
			value = v[0]
		}
		if v, ok := typed["expected-"+s.Stage]; ok && len(v) > 0 {
			expected = v[0]
		}
	}
	row.Text("stage-label", s.Label)
	row.Text("stage-trips", s.TripCountLabel)
	row.Attr("stage-bar", "data-w", meterStep(s.WeightPct))
	row.Keep("stage-bar")
	row.Text("stage-amount", s.WeightedLabel)
	if !editing {
		row.Keep("stage-pct")
		row.Text("stage-pct-text", itoa(s.WeightPct)+"%")
		row.Remove("stage-input")
		row.Remove("stage-input-label")
		row.Remove("stage-expected")
		return
	}
	row.Remove("stage-pct")
	row.Keep("stage-input")
	row.Attr("stage-input", "name", "weight-"+s.Stage)
	row.Attr("stage-input", "value", value)
	row.Attr("stage-input", "aria-label", s.Label+" "+copyWeightLabel)
	row.Remove("stage-input-label")
	row.Attr("stage-expected", "name", "expected-"+s.Stage)
	row.Attr("stage-expected", "value", expected)
}

// ── 3.11.8 Export Center ────────────────────────────────────────────────────────────────

var exportCenterSpec = page.Spec{
	File:   "agent/money/reports-export.html",
	Layout: shell.Agent,
	Slots:  withFrame("exp-from", "exp-to", "exp-empty", "exp-list"),
	Repeats: map[string][]string{
		"exp-type": {"exp-type-option"},
		"exp-row":  {"exp-title", "exp-detail", "exp-again", "exp-again-label"},
	},
}

func (a *app) serveExportCenter(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	var center *exportCenter
	if v.canRead() {
		center = a.loadExportCenter(r.Context(), v)
	}
	st := reportState(v, center != nil)

	doc := a.exportCenter.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	// The Export Center IS the export: no Export button, no period chips, no window line.
	fillReportShell(doc, reportShell{})
	if show {
		doc.Repeat("exp-type", len(exportTypes), func(i int, row *page.Row) {
			row.Attr("exp-type-option", "value", exportTypes[i])
			row.Text("exp-type-option", exportTypeNames[exportTypes[i]])
		})
		// The range the Next form opens on: January 1 of the current year, to today.
		from := center.Today
		if len(center.Today) >= 4 {
			from = center.Today[:4] + "-01-01"
		}
		doc.Attr("exp-from", "value", from)
		doc.Attr("exp-to", "value", center.Today)
		doc.Attr("exp-from", "max", center.Today)
		doc.Attr("exp-to", "min", from)

		if len(center.History) == 0 {
			doc.Keep("exp-empty")
			doc.Remove("exp-list")
		} else {
			doc.Remove("exp-empty")
			doc.Keep("exp-list")
			doc.Repeat("exp-row", len(center.History), func(i int, row *page.Row) {
				h := center.History[i]
				row.Text("exp-title", h.Title)
				row.Text("exp-detail", h.Detail)
				if h.RunAgainHref == "" {
					row.Remove("exp-again")
					return
				}
				row.Keep("exp-again")
				row.URL("exp-again", "href", h.RunAgainHref)
				label := copyRunAgain + ": " + h.Title
				if h.Detail != "" {
					label += ", " + h.Detail
				}
				row.Attr("exp-again", "aria-label", label)
				row.Keep("exp-again-label")
			})
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// ── 3.11.9 Lead Sources ─────────────────────────────────────────────────────────────────

var leadsSpec = page.Spec{
	File:   "agent/money/reports-leads.html",
	Layout: shell.Agent,
	Slots:  withFrame("rpt-subtitle", "rpt-window", "lead-empty", "lead-card", "lead-campaigns"),
	Repeats: map[string][]string{
		"chip":     chipRepeat,
		"lead-bar": {"lead-bar-label", "lead-seg-clients", "lead-seg-open", "lead-seg-closed", "lead-bar-count"},
		"lead-row": {"lead-source", "lead-leads", "lead-clients", "lead-open", "lead-closed"},
		"camp-row": {"camp-name", "camp-leads", "camp-clients"},
	},
}

func (a *app) serveLeadSources(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	period := readPeriod(r.URL.Query().Get("period"))
	var (
		win *reportWindow
		rep *leadSourcesReportView
	)
	if v.canRead() {
		win, rep = a.loadLeadSourcesReport(r.Context(), v, period)
	}
	st := reportState(v, rep != nil)

	doc := a.leads.New()
	show := fillFrame(doc, r, v, st)
	if v.noAccess {
		web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
		return
	}
	window, subtitle := "", ""
	if win != nil {
		window = win.RangeLabel
	}
	if rep != nil {
		subtitle = leadSourcesSummary(rep.Total, rep.Clients)
	}
	// Lead Sources is not in the Export Center and has no Export of its own (§3.11.9).
	fillReportShell(doc, reportShell{
		Subtitle: subtitle, HasSubtitle: true,
		Window: window, HasWindow: true,
		Chips: periodChips("leads", period, "", false),
	})
	if show {
		if rep.Empty {
			doc.Keep("lead-empty")
			doc.Remove("lead-card")
		} else {
			doc.Remove("lead-empty")
			doc.Keep("lead-card")
			doc.Repeat("lead-bar", len(rep.Lines), func(i int, row *page.Row) {
				l := rep.Lines[i]
				row.Text("lead-bar-label", l.Label)
				row.Keep("lead-seg-clients")
				row.Attr("lead-seg-clients", "data-w", l.ClientsPct)
				row.Keep("lead-seg-open")
				row.Attr("lead-seg-open", "data-w", l.OpenPct)
				row.Keep("lead-seg-closed")
				row.Attr("lead-seg-closed", "data-w", l.ClosedPct)
				row.Text("lead-bar-count", itoa(l.Leads))
			})
			doc.Repeat("lead-row", len(rep.Lines), func(i int, row *page.Row) {
				l := rep.Lines[i]
				row.Text("lead-source", l.Label)
				row.Text("lead-leads", itoa(l.Leads))
				row.Text("lead-clients", itoa(l.Clients))
				row.Text("lead-open", itoa(l.Open))
				row.Text("lead-closed", itoa(l.Closed))
			})
		}
		if len(rep.Campaigns) == 0 {
			doc.Remove("lead-campaigns")
		} else {
			doc.Keep("lead-campaigns")
			doc.Repeat("camp-row", len(rep.Campaigns), func(i int, row *page.Row) {
				c := rep.Campaigns[i]
				row.Text("camp-name", c.Name)
				row.Text("camp-leads", itoa(c.Leads))
				row.Text("camp-clients", itoa(c.Clients))
			})
		}
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}
