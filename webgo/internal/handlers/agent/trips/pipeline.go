package trips

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.2.2, the Pipeline / Funnel View: app/(agent)/agent/pipeline (page, actions) with
// StageMenu, AgentViews and queries.ts loadPipeline.
//
// Five columns from trip_status (cancelled is counted beneath, not columned). One write: a
// card's stage menu posts to agent-trip-status with the version the board was read at. A
// write that loses the race gets a 409; that is read from Result.Conflict, never from the
// sentence, and the board comes back with "moved since" on that card. On a phone one stage
// shows at a time, chosen by ?stage= (a link, not client state).

const (
	copyCancelledOne  = "1 cancelled trip is not on the board. Cancelled is a status, not a stage."
	copyCancelledMany = " cancelled trips are not on the board. Cancelled is a status, not a stage."
)

// kpiRow is the one field of AgentKpiRow the board reads: the currency its money is in. No
// row at all means not an agent, and the board is a failed read.
type kpiRow struct {
	Currency *string `json:"currency"`
}

// boardRow is the part of AgentTripRow the board shows.
type boardRow struct {
	TripID            string `json:"trip_id"`
	ClientDisplayName string `json:"client_display_name"`
	Title             string `json:"title"`
	Status            string `json:"status"`
	TotalValueCents   Cents  `json:"total_value_cents"`
	Version           int    `json:"version"`
}

type pipelineCard struct {
	tripID, clientName, title, valueLabel, status string
	version                                       int
}

type pipelineColumn struct {
	status, label, totalLabel string
	count                     int
	cards                     []pipelineCard
}

type pipelineBoard struct {
	columns   []pipelineColumn
	cancelled int
}

// buildPipeline is loadPipeline's shaping: every card of a stage in its column, the column
// summed whole (USD: trip_currency_usd), cancelled counted and left off.
func buildPipeline(trips []boardRow) pipelineBoard {
	var b pipelineBoard
	for _, st := range pipelineStages {
		col := pipelineColumn{status: st.status, label: st.label}
		var total int64
		for _, t := range trips {
			if t.Status != st.status {
				continue
			}
			total += int64(t.TotalValueCents)
			col.cards = append(col.cards, pipelineCard{tripID: t.TripID, clientName: t.ClientDisplayName, title: t.Title,
				valueLabel: money(t.TotalValueCents), status: t.Status, version: t.Version})
		}
		col.count = len(col.cards)
		col.totalLabel = formatMoney(total, true)
		b.columns = append(b.columns, col)
	}
	for _, t := range trips {
		if t.Status == "cancelled" {
			b.cancelled++
		}
	}
	return b
}

// selectedStage is the column a phone shows: ?stage= when it names one, else the first.
func selectedStage(q string) string {
	if isPipelineStage(q) {
		return q
	}
	return pipelineStages[0].status
}

func cancelledNote(n int) string {
	if n == 1 {
		return copyCancelledOne
	}
	return strconv.Itoa(n) + copyCancelledMany
}

func pipelineHref(stage string) string { return "/agent/pipeline?stage=" + url.QueryEscape(stage) }

var pipelineSlots = []string{"columns-off"}

var pipelineSpecs = []page.Spec{spec("agent/trips/pipeline.html", pipelineSlots, map[string][]string{
	"pick": {"pick", "pick-label"},
	"col":  {"col", "col-chip", "col-count", "col-total", "col-empty"},
	"card": {"c-link", "c-client", "c-title", "c-value", "c-trip", "c-from", "c-version", "c-stage", "c-select",
		"c-opt-inquiry", "c-opt-proposal", "c-opt-booked", "c-opt-in-progress", "c-opt-completed", "c-error"},
})}

type pipelineRenderer struct {
	d    handlers.Deps
	tmpl *page.Template
}

// moveError is a refused move, shown on its own card.
type moveError struct{ tripID, message string }

func (h pipelineRenderer) show(w http.ResponseWriter, r *http.Request, v visit, stage string, status int, failed *moveError) {
	doc := h.tmpl.New()
	st := stateBody
	var board *pipelineBoard
	if !v.canRead() {
		st = stateRetry
	} else {
		var (
			kpis       []kpiRow
			trips      []boardRow
			err1, err2 error
		)
		parallel(
			func() { kpis, err1 = agentread.Call[kpiRow](r.Context(), h.d.Supa, v.st, "agent_kpis", nil, h.d.Log) },
			func() {
				trips, err2 = agentread.Call[boardRow](r.Context(), h.d.Supa, v.st, "agent_trip_board", nil, h.d.Log)
			},
		)
		if err1 != nil || err2 != nil || len(kpis) == 0 {
			st = stateRetry
		} else {
			b := buildPipeline(trips)
			board = &b
		}
	}
	if fillFrame(doc, r, v, st) {
		fillPipeline(doc, board, stage, failed)
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

func mountPipeline(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/pipeline.html")
	if err != nil {
		return err
	}
	h := pipelineRenderer{d: d, tmpl: tmpl}

	rt.Protected("GET /agent/pipeline", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.show(w, r, v, selectedStage(r.URL.Query().Get("stage")), http.StatusOK, nil)
	}))

	// The sign-in round trip lands on the board.
	rt.Protected("GET /agent/pipeline/stage", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		web.SeeOther(w, r, "/agent/pipeline")
	}))

	// changeTripStage: agent-trip-status with expectedVersion, which comes down with the board.
	rt.Protected("POST /agent/pipeline/stage", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, ok := web.Form(w, r)
		if !ok {
			return
		}
		v, done := begin(w, r, d)
		if done {
			return
		}
		stage := selectedStage(f.Get("view"))
		v.here = pipelineHref(stage)
		back := func() { web.SeeOther(w, r, pipelineHref(stage)) }
		tripID, status, from := f.Get("tripId"), f.Get("status"), f.Get("from")
		version, versionOK := parseIntJS(f.Get("expectedVersion"))
		switch {
		case v.noAccess:
			h.show(w, r, v, stage, http.StatusForbidden, nil) // an admin: nothing is sent
			return
		case !v.canRead():
			h.show(w, r, v, stage, http.StatusServiceUnavailable, nil)
			return
		case !uuid.IsUUID(tripID) || !isPipelineStage(status) || !versionOK:
			// Not a move this board offers (cancelled needs a reason, from the trip).
			back()
			return
		case status == from:
			back() // the menu's own value: nothing to move
			return
		}
		res := call(r.Context(), d, r, v, "agent-trip-status", map[string]any{"tripId": tripID, "status": status, "expectedVersion": version})
		out := outcome(res, copyStageFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			back()
		default:
			msg := out.Message
			if out.Conflict {
				msg = copyStageStale // our sentence on the one condition we can name
			}
			h.show(w, r, v, stage, out.Status, &moveError{tripID: tripID, message: msg})
		}
	}))
	return nil
}

func fillPipeline(d *page.Doc, b *pipelineBoard, stage string, failed *moveError) {
	if b == nil { // fillFrame removed the body
		return
	}
	d.Repeat("pick", len(b.columns), func(i int, row *page.Row) {
		col := b.columns[i]
		on := col.status == stage
		row.URL("pick", "href", pipelineHref(col.status))
		row.Text("pick-label", col.label+" · "+strconv.Itoa(col.count))
		row.Class("pick", "chip-outlined", !on)
		row.Class("pick", "chip-secondary", on)
		if on {
			row.Attr("pick", "aria-current", "page")
		}
	})
	d.Repeat("col", len(b.columns), func(i int, row *page.Row) {
		col := b.columns[i]
		row.Keep("col")
		if col.status == stage {
			row.Attr("col", "data-selected", "true")
		}
		chip, _ := statusPresentation(col.status, "", "")
		setStatusChip(row, "col-chip", chip, col.label)
		row.Text("col-count", plural(col.count, "trip", "trips")+" · ")
		row.Text("col-total", col.totalLabel)
		if len(col.cards) == 0 {
			row.Keep("col-empty")
			row.Repeat("card", 0, nil)
			return
		}
		row.Remove("col-empty")
		row.Repeat("card", len(col.cards), func(j int, cr *page.Row) {
			c := col.cards[j]
			cr.URL("c-link", "href", tripPath(c.tripID))
			cr.Text("c-client", c.clientName)
			cr.Text("c-title", c.title)
			cr.Text("c-value", c.valueLabel)
			cr.Attr("c-trip", "value", c.tripID)
			cr.Attr("c-from", "value", c.status)
			cr.Attr("c-version", "value", strconv.Itoa(c.version))
			cr.Attr("c-stage", "value", stage)
			cr.Keep("c-select")
			for _, s := range pipelineStages {
				slot := "c-opt-" + slotKey(s.status)
				cr.Keep(slot)
				cr.Bool(slot, "selected", s.status == c.status)
			}
			if failed != nil && failed.tripID == c.tripID {
				cr.Text("c-error", failed.message)
			} else {
				cr.Remove("c-error")
			}
		})
	})
	if b.cancelled > 0 {
		d.Text("columns-off", cancelledNote(b.cancelled))
	} else {
		d.Remove("columns-off")
	}
}
