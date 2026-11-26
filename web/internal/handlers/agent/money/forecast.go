package money

import (
	"context"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 3.7.7 — Commission Forecast: a port of web/lib/agent/forecast.ts,
// lib/agent/forecastWeights.ts and app/(agent)/agent/commission/forecast/.
//
// WHOLE DOLLARS, like the dashboard: this is a projection, and cents would claim a precision
// a 50% weight does not have. (Statements are to the cent; they are records.)
//
// TRIP GRAIN. The forecast's totals ARE agent_kpis' own: the worklist's "Commission expected"
// tile shows the unweighted total and the confidence, and this screen leads with the weighted
// one, by stage. The calendar is that weighted figure by month, less what has already arrived.

// forecastStages are the four open stages, in pipeline order (Data-Model §7.4).
var forecastStages = []string{"inquiry", "proposal", "booked", "in_progress"}

// stageLabel is STAGE_LABEL. "Traveling" is the prototype's word for in_progress: that is the
// trip's status, this is what it means.
var stageLabel = map[string]string{
	"inquiry":     copyStageInquiry,
	"proposal":    copyStageProposal,
	"booked":      copyStageBooked,
	"in_progress": copyStageTraveling,
}

func isForecastStage(v string) bool { return slices.Contains(forecastStages, v) }

// forecastRow is one row of agent_commission_forecast.
type forecastRow struct {
	Status        string `json:"status"`
	WeightPct     int    `json:"weight_pct"`
	TripCount     int    `json:"trip_count"`
	RawCents      Cents  `json:"raw_cents"`
	WeightedCents Cents  `json:"weighted_cents"`
	// The same two totals ride on every row.
	TotalRawCents      Cents `json:"total_raw_cents"`
	TotalWeightedCents Cents `json:"total_weighted_cents"`
}

// cashInRow is one row of agent_commission_cash_in.
type cashInRow struct {
	Bucket        string  `json:"bucket"`
	MonthStart    *string `json:"month_start"`
	Cents         Cents   `json:"cents"`
	ReceivedCents Cents   `json:"received_cents"`
}

// stageView is one row of the stages card (ForecastStageView).
type stageView struct {
	Stage          string
	Label          string
	WeightPct      int
	TripCount      int
	TripCountLabel string
	// RawCents is this stage's unweighted commission, which the edit form previews from.
	RawCents      Cents
	WeightedLabel string
}

// cashInView is one row of the calendar (CashInRowView).
type cashInView struct {
	Key         string
	Label       string
	Cents       Cents
	AmountLabel string
	// BarPct is 0-100, against the largest row shown.
	BarPct int
	Kind   string
}

// commissionForecast is the screen (CommissionForecast).
type commissionForecast struct {
	TotalLabel string
	// AcrossLabel is "" with no open trips: "Of $0 across 0 open trips" says nothing.
	AcrossLabel   string
	AnyCommission bool
	Stages        []stageView
	Calendar      []cashInView
	ReceivedNote  string
}

// cashInBuckets are the four the calendar knows. A bucket this screen does not know is
// dropped, never drawn as a month it is not.
var cashInBuckets = []string{"overdue", "month", "later", "undated"}

// forecastView ports forecastView().
func forecastView(stages []forecastRow, calendar []cashInRow) *commissionForecast {
	var totalRaw, totalWeighted Cents
	trips := 0
	if len(stages) > 0 {
		totalRaw, totalWeighted = stages[0].TotalRawCents, stages[0].TotalWeightedCents
	}
	for _, s := range stages {
		trips += s.TripCount
	}

	out := &commissionForecast{
		TotalLabel:    money(totalWeighted),
		AnyCommission: totalRaw > 0,
	}
	if trips > 0 {
		// The worklist's confidence figure: weighted over unweighted. Absent, not 0%, when
		// there is nothing to be confident about.
		confidence, hasConfidence := 0, false
		if totalRaw > 0 {
			confidence, hasConfidence = int(jsRound(float64(totalWeighted)*100/float64(totalRaw))), true
		}
		out.AcrossLabel = forecastAcross(money(totalRaw), trips, confidence, hasConfidence)
	}

	for _, s := range stages {
		if !isForecastStage(s.Status) {
			continue
		}
		out.Stages = append(out.Stages, stageView{
			Stage:          s.Status,
			Label:          stageLabel[s.Status],
			WeightPct:      s.WeightPct,
			TripCount:      s.TripCount,
			TripCountLabel: forecastTripCount(s.TripCount),
			RawCents:       s.RawCents,
			WeightedLabel:  money(s.WeightedCents),
		})
	}

	// Overdue, later and undated only when they hold money; the twelve months always.
	var shown []cashInRow
	for _, r := range calendar {
		if slices.Contains(cashInBuckets, r.Bucket) && (r.Bucket == "month" || r.Cents > 0) {
			shown = append(shown, r)
		}
	}
	maxCents := Cents(1)
	for _, r := range shown {
		maxCents = max(maxCents, r.Cents)
	}
	firstMonth := true
	for _, r := range shown {
		row := cashInView{Cents: r.Cents, AmountLabel: money(r.Cents), Kind: r.Bucket}
		switch {
		case r.Bucket == "month" && r.MonthStart != nil:
			row.Key = *r.MonthStart
			row.Label = forecastMonthLabel(*r.MonthStart, firstMonth)
			firstMonth = false
		default:
			row.Key = r.Bucket
			switch r.Bucket {
			case "overdue":
				row.Label = copyOverdue
			case "later":
				row.Label = copyLater
			default:
				row.Label = copyUndated
			}
		}
		// A sliver for any money at all: $5 beside $20,000 is still not nothing.
		if r.Cents > 0 {
			row.BarPct = max(2, int(jsRound(float64(r.Cents)/float64(maxCents)*100)))
		}
		out.Calendar = append(out.Calendar, row)
	}

	if len(calendar) > 0 && calendar[0].ReceivedCents > 0 {
		out.ReceivedNote = forecastReceivedNote(money(calendar[0].ReceivedCents))
	}
	return out
}

// loadForecast reads both at once. nil means a read failed, or that there is not one row per
// open stage (not an advisor, or weights never seeded) — a read that did not answer, not a $0
// forecast with a live Adjust button that cannot save.
func (a *app) loadForecast(ctx context.Context, v visit) *commissionForecast {
	var (
		stages   []forecastRow
		calendar []cashInRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_forecast", map[string]any{}, &stages)
	read(rs, "agent_commission_cash_in", map[string]any{}, &calendar)
	if rs.wait() != nil || len(stages) != len(forecastStages) {
		return nil
	}
	return forecastView(stages, calendar)
}

// ── The weights ─────────────────────────────────────────────────────────────────────────

// parseWeight ports it: a whole number from 0 to 100, nothing else.
func parseWeight(input string) (int, bool) {
	t := strings.TrimSuffix(strings.TrimSpace(input), "%")
	if len(t) == 0 || len(t) > 3 {
		return 0, false
	}
	n := 0
	for _, c := range t {
		if c < '0' || c > '9' {
			return 0, false
		}
		n = n*10 + int(c-'0')
	}
	if n > 100 {
		return 0, false
	}
	return n, true
}

// weightsFromForm reads the form's two sets (`weight-<stage>` and `expected-<stage>`), as
// weightsFromForm does: the weights typed, and the weights the screen showed, so a change made
// somewhere else since is a stale refusal rather than an overwrite.
func weightsFromForm(form url.Values) (weights, expected map[string]int, ok bool) {
	read := func(prefix string) (map[string]int, bool) {
		out := make(map[string]int, len(forecastStages))
		for _, stage := range forecastStages {
			n, ok := parseWeight(form.Get(prefix + "-" + stage))
			if !ok {
				return nil, false
			}
			out[stage] = n
		}
		return out, true
	}
	w, okW := read("weight")
	e, okE := read("expected")
	if !okW || !okE {
		return nil, nil, false
	}
	return w, e, true
}

// ── The page ────────────────────────────────────────────────────────────────────────────

const forecastPath = "/agent/commission/forecast"

var forecastSpec = page.Spec{
	File:   "agent/money/forecast.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"nothing-yet",
		"total", "across",
		"adjust", "weights-form", "form-error", "form-error-text", "weights-hint",
		"calendar-received", "calendar-rows-empty",
	),
	Repeats: map[string][]string{
		"stage": {
			"stage-label", "stage-trips", "stage-bar", "stage-pct", "stage-pct-text",
			"stage-input", "stage-input-label", "stage-expected", "stage-amount",
		},
		"cash": {"cash-label", "cash-bar", "cash-amount"},
	},
}

func (a *app) serveForecast(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	var f *commissionForecast
	if v.canRead() {
		f = a.loadForecast(r.Context(), v)
	}
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case f == nil:
		st = stateRetry
	}
	doc := a.forecast.New()
	// ?edit=1 is the artboard's "weights below adjustable": an edit mode with no JavaScript,
	// so the weights are a form the advisor opens, fills and saves.
	editing := r.URL.Query().Get("edit") == "1"
	if fillFrame(doc, r, v, st) {
		fillForecast(doc, f, editing, false, "", nil)
	}
	web.Render(w, a.d.Log, doc, statusFor(st), web.Private)
}

// saveWeights is 3.7.7's "Save weights": the four open stages through agent-commission, naming
// the weights the screen showed so a change made elsewhere since is a stale refusal.
func (a *app) saveWeights(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	form, ok := web.Form(w, r)
	if !ok {
		return
	}
	reRender := func(message string) {
		var f *commissionForecast
		if v.canRead() {
			f = a.loadForecast(r.Context(), v)
		}
		st := stateBody
		switch {
		case v.noAccess:
			st = stateNoAccess
		case f == nil:
			st = stateRetry
		}
		doc := a.forecast.New()
		if fillFrame(doc, r, v, st) {
			fillForecast(doc, f, true, true, message, form)
		}
		web.Render(w, a.d.Log, doc, http.StatusUnprocessableEntity, web.Private)
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
			web.SeeOther(w, r, "/login?next="+url.QueryEscape(forecastPath))
			return
		}
		// Staleness is read off conflict, never off the function's English (edge.ts's lesson).
		msg := copySaveFailed
		if out.Conflict {
			msg = copyWeightsStale
		}
		reRender(msg)
		return
	}
	web.SeeOther(w, r, forecastPath)
}

func fillForecast(doc *page.Doc, f *commissionForecast, editing, showError bool, message string, typed url.Values) {
	if f.AnyCommission {
		doc.Remove("nothing-yet")
	} else {
		doc.Keep("nothing-yet")
	}
	doc.Text("total", f.TotalLabel)
	textOrRemove(doc, "across", f.AcrossLabel)

	if editing {
		doc.Remove("adjust")
		doc.Keep("weights-form")
		doc.Keep("weights-hint")
	} else {
		doc.Keep("adjust")
		doc.URL("adjust", "href", forecastPath+"?edit=1")
		// The hint sits inside the form, and goes with it.
		doc.Remove("weights-form")
	}
	if showError && message != "" {
		doc.Keep("form-error")
		doc.Text("form-error-text", message)
	} else {
		doc.Remove("form-error")
	}

	// The same rows §3.11.7's pipeline card draws, filled by the same code: one weights
	// card, two screens.
	doc.Repeat("stage", len(f.Stages), func(i int, row *page.Row) {
		fillStageRow(row, f.Stages[i], editing, typed)
	})

	if len(f.Calendar) == 0 {
		doc.Keep("calendar-rows-empty")
	} else {
		doc.Remove("calendar-rows-empty")
	}
	doc.Repeat("cash", len(f.Calendar), func(i int, row *page.Row) {
		c := f.Calendar[i]
		row.Text("cash-label", c.Label)
		row.Class("cash-label", "mny-cash-overdue", c.Kind == "overdue")
		row.Attr("cash-bar", "data-w", meterStep(c.BarPct))
		row.Keep("cash-bar")
		row.Text("cash-amount", c.AmountLabel)
	})
	textOrRemove(doc, "calendar-received", f.ReceivedNote)
}

// meterStep is a horizontal bar's width as a whole percent, the value money.css has a rule
// for. Like the chart's heights, it cannot be an inline style: the CSP is style-src 'self'.
func meterStep(pct int) string { return itoa(min(max(pct, 0), 100)) }
