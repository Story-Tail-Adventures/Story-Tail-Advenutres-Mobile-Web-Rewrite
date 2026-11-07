package trips

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.1, Trip List: app/(agent)/agent/trips/page.tsx and actions.ts, with
// lib/agent/trips.ts, lib/agent/tripStatuses.ts and components/agent/TripRoster*.tsx,
// TripBulkStatus.tsx and RosterPagination.tsx.
//
// Filters are a GET form, the paginator is a pair of links, and everything else lives in the
// URL, as in Next. The bulk stage change is a POST that redirects back to the same list with
// its receipt in the query (three closed values: two counts and a stage key, never text).
// Each ticked row posts `tripId:fromStatus`, because setting a stage OVERWRITES: a trip
// somebody else moved meanwhile is skipped, not clobbered.

// The copy, word for word from TRIP_COPY (lib/agent/content.ts).
const (
	copyTripsTitle        = "Trips"
	copyEmptyTitle        = "No trips yet"
	copyEmptyBody         = "The first one arrives when you build it, or when a quote request comes in."
	copyEmptyFilteredT    = "Nothing matches"
	copyEmptyFilteredBody = "Try a different search, or a different stage."
	copyNoDates           = "No dates yet"
	copyDash              = "—"
	copyBulkSelectRow     = "Select"
	copyBulkNoSelection   = "Tick at least one trip first."
	copyBulkNoStatus      = "Pick a stage first."
	copyBulkFailed        = "That didn't save. Try again in a moment."
	copyBulkCancelRefused = "Cancelling a trip is one at a time — it needs a reason and the impact review."
	paginationPrev        = "Previous" // CLIENT_COPY.paginationPrev
	paginationNext        = "Next"     // CLIENT_COPY.paginationNext
)

// tripPageSize matches agent_trip_roster's own default, so the two cannot drift.
const tripPageSize = 25

// stageFilter is one of TRIP_STATUS_FILTERS: six chips, checkboxes not radios.
type stageFilter struct{ value, label string }

var stageFilters = []stageFilter{
	{"inquiry", "Inquiry"},
	{"proposal", "Proposal"},
	{"booked", "Booked"},
	{"in_progress", "Traveling"},
	{"completed", "Completed"},
	{"cancelled", "Cancelled"},
}

// liveStatuses are the four the screen opens on: work in progress, not a decade of history.
var liveStatuses = []string{"inquiry", "proposal", "booked", "in_progress"}

func validStage(s string) bool {
	return slices.ContainsFunc(stageFilters, func(f stageFilter) bool { return f.value == s })
}

func stageLabel(s string) string {
	for _, f := range stageFilters {
		if f.value == s {
			return f.label
		}
	}
	return s
}

// tripQuery is TripQuery: ?status= repeated, ?q=, ?page=.
type tripQuery struct {
	statuses []string
	search   string
	page     int
}

// tripQueryFrom ports tripQueryFromParams: unknown statuses are dropped rather than 400'd,
// none means the live four, and a page that is not a positive integer is page 1.
func tripQueryFrom(q url.Values) tripQuery {
	var statuses []string
	for _, s := range q["status"] {
		if validStage(s) {
			statuses = append(statuses, s)
		}
	}
	if len(statuses) == 0 {
		statuses = slices.Clone(liveStatuses)
	}
	page := 1
	if p, ok := parseIntJS(firstOr(q["page"], "1")); ok && p > 0 {
		page = p
	}
	return tripQuery{statuses: statuses, search: strings.TrimSpace(q.Get("q")), page: page}
}

func firstOr(v []string, def string) string {
	if len(v) == 0 {
		return def
	}
	return v[0]
}

// isDefaultStages: the untouched default rather than a choice the advisor made.
func isDefaultStages(statuses []string) bool {
	if len(statuses) != len(liveStatuses) {
		return false
	}
	for _, s := range liveStatuses {
		if !slices.Contains(statuses, s) {
			return false
		}
	}
	return true
}

// href is the list URL for page p with the same filters: the stages only when the advisor
// picked them, the search, and the page past 1.
func (q tripQuery) href(p int) string {
	v := url.Values{}
	if !isDefaultStages(q.statuses) {
		v["status"] = slices.Clone(q.statuses)
	}
	if q.search != "" {
		v.Set("q", q.search)
	}
	if p > 1 {
		v.Set("page", strconv.Itoa(p))
	}
	return withQuery("/agent/trips", v)
}

// withQuery appends v in the order URLSearchParams would (status, q, page), not sorted.
func withQuery(path string, v url.Values) string {
	var parts []string
	for _, k := range []string{"status", "q", "page"} {
		for _, val := range v[k] {
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(val))
		}
	}
	if len(parts) == 0 {
		return path
	}
	return path + "?" + strings.Join(parts, "&")
}

// The reads (AgentTripRosterRow, AgentTripSummaryRow). Money is Cents: a digit-string.
type rosterRow struct {
	TripID               string   `json:"trip_id"`
	Title                string   `json:"title"`
	ClientID             string   `json:"client_id"`
	ClientDisplayName    string   `json:"client_display_name"`
	Status               string   `json:"status"`
	StartDate            *string  `json:"start_date"`
	EndDate              *string  `json:"end_date"`
	Destinations         []string `json:"destinations"`
	TravelerCount        int      `json:"traveler_count"`
	TotalValueCents      Cents    `json:"total_value_cents"`
	TotalCommissionCents Cents    `json:"total_commission_cents"`
	Currency             *string  `json:"currency"`
	ComponentCount       int      `json:"component_count"`
	Version              int      `json:"version"`
	AsOfDate             string   `json:"as_of_date"`
	TotalCount           int      `json:"total_count"`
}

type rosterSummaryRow struct {
	InquiryCount    int   `json:"inquiry_count"`
	ProposalCount   int   `json:"proposal_count"`
	BookedCount     int   `json:"booked_count"`
	InProgressCount int   `json:"in_progress_count"`
	CompletedCount  int   `json:"completed_count"`
	CancelledCount  int   `json:"cancelled_count"`
	PipelineCents   Cents `json:"pipeline_cents"`
}

type rosterArgs struct {
	Status   []string `json:"p_status"`
	ClientID *string  `json:"p_client_id"`
	Search   *string  `json:"p_search"`
	Limit    int      `json:"p_limit"`
	Offset   int      `json:"p_offset"`
}

// roster is TripRoster: nil from loadRoster means the READ failed, which is a different
// screen from an advisor with no trips.
type roster struct {
	rows          []rosterRow
	counts        map[string]int
	total         int
	today         string
	pipelineLabel string
	page          int
	pageCount     int
}

func loadRoster(r *http.Request, d handlers.Deps, v visit, q tripQuery) *roster {
	if !v.canRead() {
		return nil
	}
	args := rosterArgs{Status: q.statuses, Limit: tripPageSize, Offset: (q.page - 1) * tripPageSize}
	if q.search != "" {
		s := q.search
		args.Search = &s
	}
	var (
		rows    []rosterRow
		summary []rosterSummaryRow
		err1    error
		err2    error
	)
	parallel(
		func() {
			rows, err1 = agentread.Call[rosterRow](r.Context(), d.Supa, v.st, "agent_trip_roster", args, d.Log)
		},
		func() {
			summary, err2 = agentread.Call[rosterSummaryRow](r.Context(), d.Supa, v.st, "agent_trip_roster_summary", struct{}{}, d.Log)
		},
	)
	if err1 != nil || err2 != nil {
		return nil
	}
	out := &roster{rows: rows, page: q.page, counts: map[string]int{}}
	if len(rows) > 0 {
		// total_count rides on every row and is the count BEFORE the page window.
		out.total = rows[0].TotalCount
		out.today = rows[0].AsOfDate
	}
	if out.today == "" {
		out.today = v.today()
	}
	if len(summary) > 0 {
		s := summary[0]
		out.counts = map[string]int{
			"inquiry": s.InquiryCount, "proposal": s.ProposalCount, "booked": s.BookedCount,
			"in_progress": s.InProgressCount, "completed": s.CompletedCount, "cancelled": s.CancelledCount,
		}
		if s.PipelineCents > 0 {
			out.pipelineLabel = money(s.PipelineCents)
		}
	}
	out.pageCount = max(1, (out.total+tripPageSize-1)/tripPageSize)
	return out
}

// destinationLabel: one destination reads as itself; several get a count ("Nassau +2").
func destinationLabel(ds []string) string {
	switch len(ds) {
	case 0:
		return ""
	case 1:
		return ds[0]
	}
	return fmt.Sprintf("%s +%d", ds[0], len(ds)-1)
}

var listSpecs = []page.Spec{spec("agent/trips/list.html",
	[]string{
		"pipeline", "pipeline-value", "q",
		"bulk-form", "bulk-return", "receipt", "receipt-text", "empty", "empty-title", "empty-body", "table",
		"pager", "pager-range", "pager-prev", "pager-prev-off", "pager-next", "pager-next-off",
	},
	map[string][]string{
		"stage": {"stage-input", "stage-label", "stage-count"},
		"trip": {"trip-pick", "trip-link", "trip-title", "trip-meta", "trip-client",
			"trip-travel", "trip-stage", "trip-value", "trip-comm"},
		"bulk-to": {"bulk-to-opt"},
	},
)}

// receipt is what the bulk bar says above the list.
type receipt struct {
	text  string
	error bool
}

func mountList(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/list.html")
	if err != nil {
		return err
	}

	render := func(w http.ResponseWriter, r *http.Request, v visit, q tripQuery, rc *receipt, status int) {
		ro := loadRoster(r, d, v, q)
		doc := tmpl.New()
		st := stateBody
		if ro == nil {
			st = stateRetry
		}
		if fillFrame(doc, r, v, st) {
			fillList(doc, q, ro, rc, v)
		}
		web.Render(w, d.Log, doc, status, web.Private)
	}

	rt.Protected("GET /agent/trips", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		q := r.URL.Query()
		render(w, r, v, tripQueryFrom(q), receiptFromQuery(q), http.StatusOK)
	}))

	rt.Protected("POST /agent/trips", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		v, done := begin(w, r, d)
		if done {
			return
		}
		q := returnQuery(form.Get("return"))
		failWith := func(msg string, status int) {
			render(w, r, v, q, &receipt{text: msg, error: true}, status)
		}
		fail := func(msg string) { failWith(msg, http.StatusUnprocessableEntity) }

		picked := slices.DeleteFunc(slices.Clone(form["trip"]), func(s string) bool { return s == "" })
		toStatus := form.Get("toStatus")
		switch {
		case len(picked) == 0:
			fail(copyBulkNoSelection)
			return
		case !validStage(toStatus):
			fail(copyBulkNoStatus)
			return
		case toStatus == "cancelled":
			// Refused here as well as in SQL and the function: §3.4.16 owns cancelling.
			fail(copyBulkCancelRefused)
			return
		}
		type pick struct {
			TripID     string `json:"tripId"`
			FromStatus string `json:"fromStatus"`
		}
		trips := make([]pick, 0, len(picked))
		for _, entry := range picked {
			parts := strings.Split(entry, ":")
			tripID, from := parts[0], ""
			if len(parts) > 1 {
				from = parts[1]
			}
			if tripID == "" || from == "" || !validStage(from) {
				fail(copyBulkFailed)
				return
			}
			trips = append(trips, pick{tripID, from})
		}

		res := call(r.Context(), d, r, v, "agent-trip-status", map[string]any{
			"op": "bulk", "trips": trips, "status": toStatus,
		})
		out := outcome(res, copyBulkFailed)
		if out.SignIn {
			web.SeeOther(w, r, web.SignInURL(r))
			return
		}
		if !out.OK {
			failWith(out.Message, out.Status)
			return
		}
		var counts struct {
			MovedCount     *int `json:"movedCount"`
			RequestedCount *int `json:"requestedCount"`
		}
		_ = json.Unmarshal(res.Data, &counts)
		moved, requested := 0, len(trips)
		if counts.MovedCount != nil {
			moved = *counts.MovedCount
		}
		if counts.RequestedCount != nil {
			requested = *counts.RequestedCount
		}
		// Back to the same list, the receipt riding in the query as two counts and a stage key.
		target := q.href(q.page)
		sep := "?"
		if strings.Contains(target, "?") {
			sep = "&"
		}
		web.SeeOther(w, r, target+sep+url.Values{
			"moved": {strconv.Itoa(moved)}, "asked": {strconv.Itoa(requested)}, "to": {toStatus},
		}.Encode())
	}))
	return nil
}

// returnQuery reads the bulk form's hidden "return": the list URL it was posted from. Only
// its query is used, parsed again like any other, so it cannot point anywhere else.
func returnQuery(raw string) tripQuery {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "" || u.Host != "" || u.Path != "/agent/trips" {
		return tripQueryFrom(url.Values{})
	}
	return tripQueryFrom(u.Query())
}

// receiptFromQuery rebuilds the bulk receipt from its three closed values. Anything that is
// not two small counts and a stage key shows nothing.
func receiptFromQuery(q url.Values) *receipt {
	if !q.Has("moved") {
		return nil
	}
	moved, err1 := strconv.Atoi(q.Get("moved"))
	asked, err2 := strconv.Atoi(q.Get("asked"))
	to := q.Get("to")
	if err1 != nil || err2 != nil || moved < 0 || asked < moved || asked > 1000 || !validStage(to) {
		return nil
	}
	return &receipt{text: bulkStatusResult(stageLabel(to), moved, asked)}
}

// bulkStatusResult ports content.ts: the count is what MOVED, and the gap is a refusal to
// overwrite somebody, so it says "already moved on".
func bulkStatusResult(label string, moved, requested int) string {
	if moved == 0 {
		return "Nothing moved — every trip you picked had already changed stage."
	}
	who := fmt.Sprintf("%d trips", moved)
	if moved == 1 {
		who = "1 trip"
	}
	head := fmt.Sprintf("Moved %s to %s.", who, label)
	rest := requested - moved
	switch {
	case rest <= 0:
		return head
	case rest == 1:
		return head + " The other one had already moved on."
	}
	return fmt.Sprintf("%s The other %d had already moved on.", head, rest)
}

func fillList(d *page.Doc, q tripQuery, ro *roster, rc *receipt, v visit) {
	if ro.pipelineLabel == "" {
		d.Remove("pipeline")
	} else {
		d.Keep("pipeline")
		d.Text("pipeline-value", ro.pipelineLabel)
	}

	// The filters. The default (the live four) is not a selection, so the chips read as
	// unticked rather than four highlighted ones nobody chose.
	d.Attr("q", "value", q.search)
	isDefault := isDefaultStages(q.statuses)
	d.Repeat("stage", len(stageFilters), func(i int, row *page.Row) {
		f := stageFilters[i]
		row.Attr("stage-input", "value", f.value)
		row.Bool("stage-input", "checked", !isDefault && slices.Contains(q.statuses, f.value))
		row.Text("stage-label", f.label)
		row.Text("stage-count", strconv.Itoa(ro.counts[f.value]))
	})

	// The bulk form wraps BOTH branches, so its receipt outlives the rows.
	d.Keep("bulk-form")
	d.Attr("bulk-return", "value", q.href(q.page))
	if rc == nil {
		d.Remove("receipt")
	} else {
		d.Keep("receipt")
		d.Text("receipt-text", rc.text)
		if rc.error {
			d.Class("receipt", "alert-success", false)
			d.Class("receipt", "alert-error", true)
			d.Attr("receipt", "role", "alert")
		}
	}
	// No cancel option: §3.4.16 is a whole screen for cancelling one trip.
	stages := slices.DeleteFunc(slices.Clone(stageFilters), func(f stageFilter) bool { return f.value == "cancelled" })
	d.Repeat("bulk-to", len(stages), func(i int, row *page.Row) {
		row.Attr("bulk-to-opt", "value", stages[i].value)
		row.Text("bulk-to-opt", stages[i].label)
	})

	if len(ro.rows) == 0 {
		d.Keep("empty")
		if q.search != "" {
			d.Text("empty-title", copyEmptyFilteredT)
			d.Text("empty-body", copyEmptyFilteredBody)
		} else {
			d.Text("empty-title", copyEmptyTitle)
			d.Text("empty-body", copyEmptyBody)
		}
		d.Remove("table")
		d.Remove("pager")
		return
	}
	d.Remove("empty")
	d.Keep("table")
	d.Repeat("trip", len(ro.rows), func(i int, row *page.Row) {
		t := ro.rows[i]
		chip, label := statusPresentation(t.Status, "", ro.today)
		row.Attr("trip-pick", "value", t.TripID+":"+t.Status)
		row.Attr("trip-pick", "aria-label", copyBulkSelectRow+" "+t.Title)
		row.URL("trip-link", "href", "/agent/trips/"+url.PathEscape(t.TripID))
		row.Text("trip-title", t.Title)
		meta := destinationLabel(t.Destinations)
		if meta == "" {
			meta = copyDash
		}
		if t.ComponentCount > 0 {
			meta += fmt.Sprintf(" · %d", t.ComponentCount)
		}
		row.Text("trip-meta", meta)
		row.URL("trip-client", "href", "/agent/clients/"+url.PathEscape(t.ClientID))
		row.Text("trip-client", t.ClientDisplayName)
		travel := travelLabel(deref(t.StartDate), deref(t.EndDate), v.loc)
		if travel == "" {
			travel = copyNoDates
		}
		row.Text("trip-travel", travel)
		setStatusChip(row, "trip-stage", chip, label)
		row.Text("trip-value", money(t.TotalValueCents))
		// A dash, never "$0": a trip with no commission yet has not been priced.
		if t.TotalCommissionCents == 0 {
			row.Text("trip-comm", copyDash)
		} else {
			row.Text("trip-comm", money(t.TotalCommissionCents))
		}
	})

	if ro.pageCount <= 1 {
		d.Remove("pager")
		return
	}
	d.Keep("pager")
	first := (ro.page-1)*tripPageSize + 1
	last := first + len(ro.rows) - 1
	d.Text("pager-range", fmt.Sprintf("%d–%d of %d", first, last, ro.total))
	if ro.page > 1 {
		d.URL("pager-prev", "href", q.href(ro.page-1))
		d.Remove("pager-prev-off")
	} else {
		d.Remove("pager-prev")
		d.Keep("pager-prev-off")
	}
	if ro.page < ro.pageCount {
		d.URL("pager-next", "href", q.href(ro.page+1))
		d.Remove("pager-next-off")
	} else {
		d.Remove("pager-next")
		d.Keep("pager-next-off")
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
