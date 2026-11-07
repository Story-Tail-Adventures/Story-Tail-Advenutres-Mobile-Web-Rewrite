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
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.2, Trip Detail (agent view): app/(agent)/agent/trips/[tripId]/page.tsx and
// actions.ts, with the header's StageMenu (pipeline/actions.ts changeTripStage), the
// SaveAsTemplateDialog (templates/actions.ts) and the CancelTripDialog (§3.4.16).
//
// Eight tabs, one URL each (?tab=), each its own page load: the overview, the payments and
// the open commission lines back the header and the side cards on every tab; everything
// else is read only for the tab asked for. An unknown tab is the overview.
//
// The writes post to their own paths and come back with a 303 to the same tab. A rejection
// draws the same page again with the visitor's values and the function's sentence: 409 for
// the optimistic lock (read from the result's Conflict, never from the words), 422 for any
// other refusal, 503 when the function could not be reached. A dialog that failed comes back
// open. The two dialogs' receipts ride back in the query as counts only.
//
// Two deliberate differences from Next, both because Go is not bound by what forced them:
//   - A trip that is not there (or is another advisor's) answers 404 with TripNotFound;
//     Next answered 200 only because its not-found path lost the dark scheme.
//   - A failed read offers "Try again" (this same URL); Next's ErrorState here had no retry
//     and sent the advisor to /dashboard, the traveler route.

// AGENT_COPY, word for word.
const (
	copyStageStale    = "This trip moved since the board was loaded. Reload and try again."
	copyStageFailed   = "Could not move the trip. Try again in a moment."
	copyNotesStale    = "This trip changed since you opened it. Reload and try again."
	copyNotesFailed   = "Could not save the note. Try again in a moment."
	copyCancelFailed  = "That did not save. Try again in a moment."
	copyCancelStale   = "This trip moved since the page loaded. Reload and try again."
	copyCancelOpen    = "Cancel trip"
	copySaveDetails   = "Save details"
	copySaveFailed    = "That did not save. Try again in a moment." // TEMPLATE_COPY.saveFailed
	copySaveNameReq   = "A template needs a name."                  // TEMPLATE_COPY.saveNameRequired
	copyGlanceNotSet  = "Not set"
	copyGlanceNoAct   = "No activity yet"
	copyPaymentsEmpty = "No payments scheduled."
	copyPaymentsDone  = "All payments settled."
	copyCancelBody    = "This marks the trip cancelled and tells the client's screen why. It does not contact any supplier or move any money. Those are still yours to do."
	copyCancelEditBdy = "Correct what the client reads. The trip stays cancelled."
)

// pipelineStages are PIPELINE_STAGES (lib/agent/queries.ts): the five columns, trip_status
// minus cancelled. The stage menu offers them; cancelling is the dialog's job.
var pipelineStages = []struct{ status, label string }{
	{"inquiry", "Inquiry"},
	{"proposal", "Proposal"},
	{"booked", "Booked"},
	{"in_progress", "In progress"},
	{"completed", "Completed"},
}

func isPipelineStage(s string) bool {
	return slices.ContainsFunc(pipelineStages, func(p struct{ status, label string }) bool { return p.status == s })
}

// tripTabs are TRIP_DETAIL_TABS, in order.
var tripTabs = []string{"overview", "components", "itinerary", "payments", "documents", "messages", "notes", "activity"}

// validTab ports validTripTab: an unknown or missing tab is the overview.
func validTab(raw string) string {
	if slices.Contains(tripTabs, raw) {
		return raw
	}
	return "overview"
}

func tripPath(tripID string) string { return "/agent/trips/" + url.PathEscape(tripID) }

// tabHref is the URL of one tab: the trip's own path for the overview, ?tab= for the rest.
func tabHref(tripID, tab string) string {
	if tab == "overview" {
		return tripPath(tripID)
	}
	return tripPath(tripID) + "?tab=" + tab
}

// withParams appends query parameters to a tab URL.
func withParams(href string, v url.Values) string {
	sep := "?"
	if strings.Contains(href, "?") {
		sep = "&"
	}
	return href + sep + v.Encode()
}

// detailView is everything one render of the page shows.
type detailView struct {
	tripID   string
	tab      string
	ov       *overview
	payments []payment
	lines    []openLine // nil: the read failed
	linesOK  bool

	components []component
	itin       *itinerary
	documents  []document
	messages   []tripMessage
	activity   []activity
	tabFailed  bool

	stageError string

	notesValue *string // what was typed, after a refused save
	notesError string
	notesStale bool
	notesSaved bool

	cancel *cancelForm
	save   *saveForm
}

// cancelForm is the cancel dialog after a post: what was typed and why it was refused, or
// the receipt.
type cancelForm struct {
	reason, refundStatus, refundDetail string
	closeLines                         bool
	editing                            bool
	err                                string
	receipt                            string
}

type saveForm struct {
	name, description string
	err               string
	receipt           string
}

var detailSlots = []string{
	"not-found", "trip", "client-name", "title", "status", "build-link", "save-sr", "cancel-open", "cancel-sr",
	"stage-form", "stage-version", "stage-tab", "stage-error",
	"ttab-overview", "ttab-components", "ttab-itinerary", "ttab-payments", "ttab-documents", "ttab-messages", "ttab-notes", "ttab-activity",
	"tab-error", "tab-retry",
	"pane-overview", "g-type", "g-destination", "g-travelers", "g-dates", "g-activity",
	"g-reason-cell", "g-reason", "g-refund-cell", "g-refund", "g-refund-detail-cell", "g-refund-detail",
	"pane-components", "edit-components", "components-empty",
	"pane-itinerary", "edit-itinerary", "it-published", "it-empty",
	"pane-payments", "edit-schedule", "pay-full-empty",
	"pane-documents", "documents-empty",
	"pane-messages", "msg-reply", "messages-empty",
	"pane-notes", "notes-version", "notes", "notes-save", "notes-saved", "notes-error",
	"pane-activity", "activity-empty",
	"cost-total", "cost-paid", "cost-commission", "ledger-link", "ledger-add", "pay-side-empty",
	"save-dialog", "save-receipt", "save-form", "save-tab", "save-name", "save-description", "save-error", "save-error-text",
	"save-actions", "save-done", "save-done-link",
	"cancel-dialog", "cancel-eyebrow", "cancel-title", "cancel-done", "cancel-receipt", "cancel-done-link",
	"cancel-form", "cancel-version", "cancel-tab", "cancel-body", "cancel-impact", "impact-none", "impact-list",
	"cancel-lines-unavailable", "cancel-lines", "cancel-close", "cancel-close-label", "cancel-reason",
	"cancel-refund-detail", "cancel-reason-hint", "cancel-error", "cancel-submit",
}

var componentIconSlots = []string{"c-icon-plane", "c-icon-building", "c-icon-ship", "c-icon-trip", "c-icon-sparkle", "c-icon-shield", "c-icon-receipt"}

var detailSpecs = []page.Spec{spec("agent/trips/detail.html", detailSlots, map[string][]string{
	"stage-opt":   {"stage-opt"},
	"component":   append(slices.Clone(componentIconSlots), "c-title", "c-subtitle", "c-badge", "c-cost"),
	"it-row":      {"it-row", "it-day", "it-daynum", "it-daylabel", "it-daydate", "it-summary", "it-act", "it-block", "it-title", "it-body", "it-tip", "it-tip-text"},
	"pay-full":    {"pf-dot", "pf-label", "pf-amount"},
	"document":    {"d-name", "d-meta"},
	"message":     {"m-card", "m-sender", "m-internal", "m-date", "m-body"},
	"history":     {"h-change", "h-who", "h-when"},
	"pay-side":    {"ps-dot", "ps-label", "ps-amount"},
	"impact":      {"impact-line"},
	"cancel-line": {"cl-value", "cl-text"},
	"refund-opt":  {"refund-opt"},
})}

// detailRenderer draws Trip Detail for a request, with whatever a refused post adds.
type detailRenderer struct {
	d    handlers.Deps
	tmpl *page.Template
}

// show reads what the tab needs and renders it. extra adjusts the view after the reads (a
// refused form's values and sentence).
func (h detailRenderer) show(w http.ResponseWriter, r *http.Request, v visit, tripID, tab string, status int, extra func(*detailView)) {
	doc := h.tmpl.New()
	dv := &detailView{tripID: tripID, tab: tab}
	st := stateBody
	notFound := false
	switch {
	case !v.canRead():
		st = stateRetry
	case !uuid.IsUUID(tripID):
		notFound = true // nothing to ask the database about
	default:
		var res overviewResult
		parallel(
			func() { res = loadOverview(r, h.d, v, tripID) },
			func() { dv.payments = loadPayments(r, h.d, v, tripID) },
			func() {
				dv.lines = loadOpenCommission(r, h.d, v, tripID)
				dv.linesOK = dv.lines != nil
			},
			func() { h.loadTab(r, v, dv) },
		)
		switch {
		case res.notFound:
			notFound = true
		case res.ov == nil || dv.payments == nil:
			st = stateRetry
		default:
			dv.ov = res.ov
		}
	}
	if notFound && status == http.StatusOK {
		status = http.StatusNotFound
	}
	if extra != nil && dv.ov != nil {
		extra(dv)
	}
	if fillFrame(doc, r, v, st) {
		if notFound {
			doc.Keep("not-found")
			doc.Remove("trip")
		} else {
			doc.Remove("not-found")
			doc.Keep("trip")
			fillDetail(doc, r, dv)
		}
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

// loadTab reads only what the asked-for tab shows. The overview and payments tabs need
// nothing beyond what every tab reads.
func (h detailRenderer) loadTab(r *http.Request, v visit, dv *detailView) {
	switch dv.tab {
	case "components":
		dv.components = loadComponents(r, h.d, v, dv.tripID)
		dv.tabFailed = dv.components == nil
	case "itinerary":
		dv.itin = loadItinerary(r, h.d, v, dv.tripID)
		dv.tabFailed = dv.itin == nil
	case "documents":
		dv.documents = loadDocuments(r, h.d, v, dv.tripID)
		dv.tabFailed = dv.documents == nil
	case "messages":
		dv.messages = loadMessages(r, h.d, v, dv.tripID)
		dv.tabFailed = dv.messages == nil
	case "activity":
		dv.activity = loadActivity(r, h.d, v, dv.tripID)
		dv.tabFailed = dv.activity == nil
	}
}

func mountDetail(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/detail.html")
	if err != nil {
		return err
	}
	h := detailRenderer{d: d, tmpl: tmpl}

	rt.Protected("GET /agent/trips/{tripId}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		q := r.URL.Query()
		h.show(w, r, v, r.PathValue("tripId"), validTab(q.Get("tab")), http.StatusOK, func(dv *detailView) {
			receiptsFromQuery(dv, q)
		})
	}))

	// post wraps the four writes: the form, the advisor, the trip and the tab it came from.
	post := func(pattern string, fn func(w http.ResponseWriter, r *http.Request, v visit, tripID, tab string, f url.Values)) {
		rt.Protected(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			f, ok := web.Form(w, r)
			if !ok {
				return
			}
			v, done := begin(w, r, d)
			if done {
				return
			}
			tripID := r.PathValue("tripId")
			if !uuid.IsUUID(tripID) {
				h.show(w, r, v, tripID, "overview", http.StatusNotFound, nil)
				return
			}
			fn(w, r, v, tripID, validTab(f.Get("tab")), f)
		}))
	}

	// StageMenu: changeTripStage. expectedVersion comes down with the page; a 409 means the
	// trip moved under the advisor, and the page says so in its own words.
	post("POST /agent/trips/{tripId}/stage", func(w http.ResponseWriter, r *http.Request, v visit, tripID, tab string, f url.Values) {
		next := f.Get("status")
		version, verr := strconv.Atoi(f.Get("expectedVersion"))
		if next == f.Get("from") && next != "" {
			web.SeeOther(w, r, tabHref(tripID, tab)) // nothing changed
			return
		}
		if !isPipelineStage(next) || verr != nil {
			h.show(w, r, v, tripID, tab, http.StatusUnprocessableEntity, func(dv *detailView) { dv.stageError = copyStageFailed })
			return
		}
		res := call(r.Context(), d, r, v, "agent-trip-status", map[string]any{
			"tripId": tripID, "status": next, "expectedVersion": version,
		})
		out := outcome(res, copyStageFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case out.OK:
			web.SeeOther(w, r, tabHref(tripID, tab))
		default:
			msg := out.Message
			if out.Conflict {
				msg = copyStageStale
			}
			h.show(w, r, v, tripID, tab, out.Status, func(dv *detailView) { dv.stageError = msg })
		}
	})

	// TripNotesEditor: updateTripNotes. The text is sent as typed.
	post("POST /agent/trips/{tripId}/notes", func(w http.ResponseWriter, r *http.Request, v visit, tripID, _ string, f url.Values) {
		notes := f.Get("notes")
		version, verr := strconv.Atoi(f.Get("expectedVersion"))
		again := func(status int, msg string, stale bool) {
			h.show(w, r, v, tripID, "notes", status, func(dv *detailView) {
				dv.notesValue, dv.notesError, dv.notesStale = &notes, msg, stale
			})
		}
		if verr != nil {
			again(http.StatusUnprocessableEntity, copyNotesFailed, false)
			return
		}
		res := call(r.Context(), d, r, v, "agent-trip-notes", map[string]any{
			"tripId": tripID, "notes": notes, "expectedVersion": version,
		})
		out := outcome(res, copyNotesFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case out.OK:
			web.SeeOther(w, r, withParams(tabHref(tripID, "notes"), url.Values{"noted": {"1"}}))
		case out.Conflict:
			again(out.Status, copyNotesStale, true)
		default:
			again(out.Status, out.Message, false)
		}
	})

	// CancelTripDialog: cancelTripAction. One write for cancelling and for correcting a
	// cancellation; omitted refund fields mean "leave them alone", never "clear them".
	post("POST /agent/trips/{tripId}/cancel", func(w http.ResponseWriter, r *http.Request, v visit, tripID, tab string, f url.Values) {
		cf := &cancelForm{
			reason: strings.TrimSpace(f.Get("reason")), refundStatus: f.Get("refundStatus"),
			refundDetail: f.Get("refundDetail"), closeLines: f.Get("closeLines") == "1",
			editing: f.Get("editing") == "1",
		}
		again := func(status int, msg string) {
			cf.err = msg
			h.show(w, r, v, tripID, tab, status, func(dv *detailView) { dv.cancel = cf })
		}
		version, verr := strconv.Atoi(f.Get("expectedVersion"))
		if verr != nil {
			again(http.StatusUnprocessableEntity, copyCancelFailed)
			return
		}
		type closeLine struct {
			ID      string `json:"id"`
			Version int    `json:"version"`
		}
		var named []closeLine
		if cf.closeLines {
			for _, raw := range f["line"] {
				id, ver, ok := strings.Cut(raw, ":")
				n, err := strconv.Atoi(ver)
				if !ok || !uuid.IsUUID(id) || err != nil {
					again(http.StatusUnprocessableEntity, copyCancelFailed)
					return
				}
				named = append(named, closeLine{id, n})
			}
		}
		body := map[string]any{
			"tripId": tripID, "status": "cancelled", "expectedVersion": version, "cancellationReason": cf.reason,
		}
		if isRefundStatus(cf.refundStatus) {
			body["refundStatus"] = cf.refundStatus
		}
		if detail := strings.TrimSpace(cf.refundDetail); detail != "" {
			body["refundDetail"] = detail
		}
		if len(named) > 0 {
			body["closeCommission"] = named
		}
		res := call(r.Context(), d, r, v, "agent-trip-status", body)
		out := outcome(res, copyCancelFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case out.OK:
			var counts struct {
				Closed  json.RawMessage `json:"commissionLinesClosed"`
				Skipped json.RawMessage `json:"commissionLinesSkipped"`
			}
			_ = json.Unmarshal(res.Data, &counts)
			target := tabHref(tripID, tab)
			if len(named) > 0 {
				cancelled := "1"
				if cf.editing {
					cancelled = "0"
				}
				target = withParams(target, url.Values{
					"cancelled": {cancelled}, "named": {strconv.Itoa(len(named))},
					"closed": {strconv.Itoa(countOf(counts.Closed))}, "skipped": {strconv.Itoa(countOf(counts.Skipped))},
				})
			}
			web.SeeOther(w, r, target)
		case out.Conflict:
			again(out.Status, copyCancelStale)
		default:
			again(out.Status, out.Message)
		}
	})

	// SaveAsTemplateDialog: saveAsTemplateAction.
	post("POST /agent/trips/{tripId}/save-template", func(w http.ResponseWriter, r *http.Request, v visit, tripID, tab string, f url.Values) {
		sf := &saveForm{name: strings.TrimSpace(f.Get("name")), description: f.Get("description")}
		again := func(status int, msg string) {
			sf.err = msg
			h.show(w, r, v, tripID, tab, status, func(dv *detailView) { dv.save = sf })
		}
		if sf.name == "" {
			again(http.StatusUnprocessableEntity, copySaveNameReq)
			return
		}
		body := map[string]any{"op": "save", "tripId": tripID, "name": sf.name}
		if desc := strings.TrimSpace(sf.description); desc != "" {
			body["description"] = desc
		}
		res := call(r.Context(), d, r, v, "agent-template", body)
		out := outcome(res, copySaveFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case out.OK:
			var saved struct {
				Components json.RawMessage `json:"componentsSaved"`
				Days       json.RawMessage `json:"daysSaved"`
			}
			_ = json.Unmarshal(res.Data, &saved)
			web.SeeOther(w, r, withParams(tabHref(tripID, tab), url.Values{
				"saved": {"1"}, "bookings": {strconv.Itoa(countOf(saved.Components))}, "days": {strconv.Itoa(countOf(saved.Days))},
			}))
		default:
			again(out.Status, out.Message)
		}
	})
	return nil
}

// countOf reads a count off a function's answer; anything that is not a positive integer is
// none, never NaN on screen (actions.ts count()).
func countOf(raw json.RawMessage) int {
	var n int64
	if json.Unmarshal(raw, &n) != nil || n <= 0 || n > 1_000_000 {
		return 0
	}
	return int(n)
}

// smallCount reads a receipt count from the query: a small non-negative integer, or false.
func smallCount(q url.Values, key string) (int, bool) {
	n, err := strconv.Atoi(q.Get(key))
	return n, err == nil && n >= 0 && n <= 1_000_000
}

// receiptsFromQuery rebuilds the dialogs' receipts and the notes' "Saved" from closed values.
func receiptsFromQuery(dv *detailView, q url.Values) {
	if q.Get("noted") == "1" && dv.tab == "notes" {
		dv.notesSaved = true
	}
	if q.Get("saved") == "1" {
		b, ok1 := smallCount(q, "bookings")
		dd, ok2 := smallCount(q, "days")
		if ok1 && ok2 {
			dv.save = &saveForm{receipt: savedReceipt(b, dd)}
		}
	}
	if c := q.Get("cancelled"); c == "1" || c == "0" {
		named, ok1 := smallCount(q, "named")
		closed, ok2 := smallCount(q, "closed")
		skipped, ok3 := smallCount(q, "skipped")
		if ok1 && ok2 && ok3 {
			if text := cancelReceipt(c == "1", named, closed, skipped); text != "" {
				dv.cancel = &cancelForm{receipt: text, editing: c == "0"}
			}
		}
	}
}

func fillDetail(d *page.Doc, r *http.Request, dv *detailView) {
	ov := dv.ov
	id := dv.tripID
	here := tabHref(id, dv.tab)

	// ── Header ────────────────────────────────────────────────────────────────────────────
	d.Text("client-name", ov.clientName)
	d.Text("title", ov.title)
	chip, label := statusPresentation(ov.status, ov.nextUnpaidDue, ov.today)
	setStatusChip(d, "status", chip, label)
	d.URL("build-link", "href", tripPath(id)+"/builder")
	d.Text("save-sr", " — "+ov.title)
	alreadyCancelled := ov.status == "cancelled"
	if alreadyCancelled {
		d.Text("cancel-open", copySaveDetails)
	} else {
		d.Text("cancel-open", copyCancelOpen)
	}
	d.Text("cancel-sr", " — "+ov.title)

	d.URL("stage-form", "action", tripPath(id)+"/stage")
	d.Attr("stage-version", "value", strconv.Itoa(ov.version))
	d.Attr("stage-tab", "value", dv.tab)
	d.Repeat("stage-opt", len(pipelineStages), func(i int, row *page.Row) {
		s := pipelineStages[i]
		row.Attr("stage-opt", "value", s.status)
		row.Text("stage-opt", s.label)
		row.Bool("stage-opt", "selected", s.status == ov.status)
	})
	if dv.stageError == "" {
		d.Remove("stage-error")
	} else {
		d.Text("stage-error", dv.stageError)
	}

	// ── Tabs ──────────────────────────────────────────────────────────────────────────────
	for _, t := range tripTabs {
		slot := "ttab-" + t
		d.URL(slot, "href", tabHref(id, t))
		if t == dv.tab {
			d.Class(slot, "chip-outlined", false)
			d.Class(slot, "chip-secondary", true)
			d.Attr(slot, "aria-current", "page")
		}
	}

	// ── The tab ──────────────────────────────────────────────────────────────────────────
	for _, t := range tripTabs {
		if t != dv.tab || dv.tabFailed {
			d.Remove("pane-" + t)
		}
	}
	if dv.tabFailed {
		d.Keep("tab-error")
		d.URL("tab-retry", "href", r.URL.RequestURI())
	} else {
		d.Remove("tab-error")
		fillPane(d, dv)
	}

	// ── The side cards, on every tab ─────────────────────────────────────────────────────
	d.Text("cost-total", ov.totalValueLabel)
	d.Text("cost-paid", ov.totalPaidLabel)
	d.Text("cost-commission", ov.totalCommission)
	d.URL("ledger-link", "href", "/agent/commission/ledger?trip="+url.QueryEscape(id))
	d.URL("ledger-add", "href", "/agent/commission/ledger/new?trip="+url.QueryEscape(id))
	fillPayments(d, "pay-side", "ps-", "pay-side-empty", dv.payments, false)

	fillSaveDialog(d, dv, here)
	fillCancelDialog(d, dv, here, alreadyCancelled)
}

// fillPayments draws PaymentsSummaryCard: every milestone (full), or the next three unpaid.
func fillPayments(d *page.Doc, repeat, prefix, emptySlot string, all []payment, full bool) {
	rows := all
	if !full {
		rows = nil
		for _, p := range all {
			if p.status != "paid" && len(rows) < 3 {
				rows = append(rows, p)
			}
		}
	}
	if len(rows) == 0 {
		if len(all) == 0 {
			d.Text(emptySlot, copyPaymentsEmpty)
		} else {
			d.Text(emptySlot, copyPaymentsDone)
		}
	} else {
		d.Remove(emptySlot)
	}
	d.Repeat(repeat, len(rows), func(i int, row *page.Row) {
		p := rows[i]
		row.Keep(prefix + "dot")
		row.Class(prefix+"dot", "trp-dot-warn", !p.good)
		row.Class(prefix+"dot", "trp-dot-good", p.good)
		when := p.dueLabel
		switch {
		case p.status == "paid":
			when = "Paid"
		case when == "":
			when = "No date"
		}
		row.Text(prefix+"label", p.label+" · "+when)
		row.Text(prefix+"amount", p.amountLabel)
	})
}

func fillPane(d *page.Doc, dv *detailView) {
	ov, id := dv.ov, dv.tripID
	switch dv.tab {
	case "overview":
		d.Keep("pane-overview")
		d.Text("g-type", tripTypeShort(ov.tripType))
		if len(ov.destinations) > 0 {
			d.Text("g-destination", strings.Join(ov.destinations, ", "))
		} else {
			d.Text("g-destination", copyGlanceNotSet)
		}
		d.Text("g-travelers", plural(ov.travelerCount, "traveler", "travelers"))
		switch {
		case ov.startLabel != "" && ov.endLabel != "":
			d.Text("g-dates", ov.startLabel+" – "+ov.endLabel)
		case ov.startLabel != "":
			d.Text("g-dates", ov.startLabel)
		case ov.endLabel != "":
			d.Text("g-dates", ov.endLabel)
		default:
			d.Text("g-dates", copyGlanceNotSet)
		}
		if ov.lastActivityLabel != "" {
			d.Text("g-activity", ov.lastActivityLabel)
		} else {
			d.Text("g-activity", copyGlanceNoAct)
		}
		optionalCell(d, "g-reason-cell", "g-reason", ov.cancellationReason)
		optionalCell(d, "g-refund-cell", "g-refund", refundStatusLabel(ov.refundStatus))
		optionalCell(d, "g-refund-detail-cell", "g-refund-detail", ov.refundDetail)

	case "components":
		d.Keep("pane-components")
		d.URL("edit-components", "href", tripPath(id)+"/builder")
		if len(dv.components) == 0 {
			d.Keep("components-empty")
		} else {
			d.Remove("components-empty")
		}
		d.Repeat("component", len(dv.components), func(i int, row *page.Row) {
			c := dv.components[i]
			for _, s := range componentIconSlots {
				if s == "c-icon-"+c.icon {
					row.Keep(s)
				} else {
					row.Remove(s)
				}
			}
			row.Text("c-title", c.title)
			if c.subtitle == "" {
				row.Remove("c-subtitle")
			} else {
				row.Text("c-subtitle", c.subtitle)
			}
			row.Text("c-badge", c.sourceBadge)
			row.Text("c-cost", c.costLabel)
		})

	case "itinerary":
		d.Keep("pane-itinerary")
		d.URL("edit-itinerary", "href", tripPath(id)+"/itinerary")
		d.Text("it-published", dv.itin.publishedLabel())
		if len(dv.itin.days) == 0 {
			d.Keep("it-empty")
		} else {
			d.Remove("it-empty")
		}
		fillItineraryRows(d, dv.itin.days)

	case "payments":
		d.Keep("pane-payments")
		d.URL("edit-schedule", "href", tripPath(id)+"/payments")
		fillPayments(d, "pay-full", "pf-", "pay-full-empty", dv.payments, true)

	case "documents":
		d.Keep("pane-documents")
		if len(dv.documents) == 0 {
			d.Keep("documents-empty")
		} else {
			d.Remove("documents-empty")
		}
		d.Repeat("document", len(dv.documents), func(i int, row *page.Row) {
			row.Text("d-name", dv.documents[i].filename)
			row.Text("d-meta", dv.documents[i].meta)
		})

	case "messages":
		d.Keep("pane-messages")
		// newMessageHref: replying happens in the thread itself, which this opens or starts.
		d.URL("msg-reply", "href", "/agent/messages/new?"+url.Values{"client": {ov.clientID}, "trip": {id}}.Encode())
		if len(dv.messages) == 0 {
			d.Keep("messages-empty")
		} else {
			d.Remove("messages-empty")
		}
		d.Repeat("message", len(dv.messages), func(i int, row *page.Row) {
			m := dv.messages[i]
			row.Keep("m-card")
			row.Class("m-card", "trp-flat", m.internal)
			row.Text("m-sender", m.sender)
			if m.internal {
				row.Keep("m-internal")
			} else {
				row.Remove("m-internal")
			}
			row.Text("m-date", m.created)
			row.Text("m-body", m.body)
		})

	case "notes":
		d.Keep("pane-notes")
		d.URL("pane-notes", "action", tripPath(id)+"/notes")
		d.Attr("notes-version", "value", strconv.Itoa(ov.version))
		if dv.notesValue != nil {
			d.Text("notes", *dv.notesValue)
		} else {
			d.Text("notes", ov.notes)
		}
		d.Keep("notes-save")
		// A stale save can only fail again; the button stops offering it.
		d.Bool("notes-save", "disabled", dv.notesStale)
		if dv.notesSaved && dv.notesError == "" {
			d.Keep("notes-saved")
		} else {
			d.Remove("notes-saved")
		}
		if dv.notesError == "" {
			d.Remove("notes-error")
		} else {
			d.Text("notes-error", dv.notesError)
		}

	case "activity":
		d.Keep("pane-activity")
		if len(dv.activity) == 0 {
			d.Keep("activity-empty")
		} else {
			d.Remove("activity-empty")
		}
		d.Repeat("history", len(dv.activity), func(i int, row *page.Row) {
			row.Text("h-change", dv.activity[i].change)
			row.Text("h-who", dv.activity[i].who)
			row.Text("h-when", dv.activity[i].when)
		})
	}
}

func optionalCell(d *page.Doc, cell, slot, value string) {
	if value == "" {
		d.Remove(cell)
		return
	}
	d.Keep(cell)
	d.Text(slot, value)
}

// blockLabel is TripItineraryView's BLOCK_LABEL, upper-casing anything else.
func blockLabel(b string) string {
	switch b {
	case "morning":
		return "MORNING"
	case "afternoon":
		return "AFTERNOON"
	case "evening":
		return "EVENING"
	case "all_day":
		return "ALL DAY"
	}
	return strings.ToUpper(b)
}

// itRow is one row of the flattened itinerary: a day's header, or one of its activities.
type itRow struct {
	day *itineraryDay
	act *itineraryActivity
	gap string // the space above it, the margins of the nested Next layout
	end string // the space under the last row
}

// flattenItinerary lays days and activities out as one list (repeats cannot nest), keeping
// the Next spacing: 8px above each activity, 16px between days, 8px more after a day with no
// activities (its empty activity stack still had its top margin).
func flattenItinerary(days []itineraryDay) []itRow {
	var rows []itRow
	for i := range days {
		day := &days[i]
		gap := ""
		if i > 0 {
			gap = "trp-it-gap-16"
			if len(days[i-1].activities) == 0 {
				gap = "trp-it-gap-24"
			}
		}
		rows = append(rows, itRow{day: day, gap: gap})
		for j := range day.activities {
			rows = append(rows, itRow{act: &day.activities[j], gap: "trp-it-gap-8"})
		}
	}
	if n := len(rows); n > 0 {
		rows[n-1].end = "trp-it-end-16"
		if len(days[len(days)-1].activities) == 0 {
			rows[n-1].end = "trp-it-end-24"
		}
	}
	return rows
}

func fillItineraryRows(d *page.Doc, days []itineraryDay) {
	rows := flattenItinerary(days)
	d.Repeat("it-row", len(rows), func(i int, row *page.Row) {
		x := rows[i]
		row.Keep("it-row")
		row.Class("it-row", "trp-it-gap-8", x.gap == "trp-it-gap-8")
		row.Class("it-row", "trp-it-gap-16", x.gap == "trp-it-gap-16")
		row.Class("it-row", "trp-it-gap-24", x.gap == "trp-it-gap-24")
		row.Class("it-row", "trp-it-end-16", x.end == "trp-it-end-16")
		row.Class("it-row", "trp-it-end-24", x.end == "trp-it-end-24")
		if x.day != nil {
			row.Remove("it-act")
			row.Keep("it-day")
			row.Text("it-daynum", fmt.Sprintf("Day %d", x.day.number))
			optionalRow(row, "it-daylabel", x.day.label)
			optionalRow(row, "it-daydate", x.day.dateLabel)
			optionalRow(row, "it-summary", x.day.summ)
			return
		}
		a := x.act
		row.Remove("it-day")
		row.Keep("it-act")
		optionalRow(row, "it-block", blockLabel(a.block))
		title := a.title
		if a.timeLabel != "" {
			title = a.timeLabel + " · " + a.title
		}
		row.Text("it-title", title)
		optionalRow(row, "it-body", a.body)
		if a.tip == "" {
			row.Remove("it-tip")
		} else {
			row.Keep("it-tip")
			row.Text("it-tip-text", a.tip)
		}
	})
}

func optionalRow(row *page.Row, slot, value string) {
	if value == "" {
		row.Remove(slot)
		return
	}
	row.Text(slot, value)
}

func fillSaveDialog(d *page.Doc, dv *detailView, here string) {
	ov := dv.ov
	sf := dv.save
	d.Keep("save-dialog")
	if sf != nil {
		d.Bool("save-dialog", "open", true) // ui.js upgrades it to a modal on load
	}
	d.URL("save-form", "action", tripPath(dv.tripID)+"/save-template")
	d.Attr("save-tab", "value", dv.tab)
	if sf != nil && sf.receipt != "" {
		d.Text("save-receipt", sf.receipt)
		d.Remove("save-form")
		d.Remove("save-actions")
		d.Keep("save-done")
		d.URL("save-done-link", "href", here)
		return
	}
	d.Remove("save-receipt")
	d.Remove("save-done")
	d.Keep("save-actions")
	name, desc := ov.title, ""
	if sf != nil {
		name, desc = sf.name, sf.description
	}
	d.Attr("save-name", "value", name)
	d.Attr("save-description", "value", desc)
	if sf == nil || sf.err == "" {
		d.Remove("save-error")
	} else {
		d.Keep("save-error")
		d.Text("save-error-text", sf.err)
	}
}

func fillCancelDialog(d *page.Doc, dv *detailView, here string, alreadyCancelled bool) {
	ov := dv.ov
	cf := dv.cancel
	editing := alreadyCancelled
	if cf != nil {
		editing = cf.editing
	}
	d.Keep("cancel-dialog")
	label := copyCancelOpen
	if editing {
		label = copySaveDetails
		d.Text("cancel-eyebrow", "CANCELLATION DETAILS")
	} else {
		d.Text("cancel-eyebrow", "CANCEL TRIP")
	}
	d.Attr("cancel-dialog", "aria-label", label)
	if cf != nil {
		d.Bool("cancel-dialog", "open", true)
	}
	d.Text("cancel-title", ov.title)

	if cf != nil && cf.receipt != "" {
		d.Keep("cancel-done")
		d.Text("cancel-receipt", cf.receipt)
		d.URL("cancel-done-link", "href", here)
		d.Remove("cancel-form")
		return
	}
	d.Remove("cancel-done")
	d.URL("cancel-form", "action", tripPath(dv.tripID)+"/cancel")
	d.Attr("cancel-version", "value", strconv.Itoa(ov.version))
	d.Attr("cancel-tab", "value", dv.tab)
	if editing {
		d.Text("cancel-body", copyCancelEditBdy)
		d.Remove("cancel-impact") // every line would be in the past tense
	} else {
		d.Text("cancel-body", copyCancelBody)
		d.Keep("cancel-impact")
		impact := cancelImpact(ov)
		if len(impact) == 0 {
			d.Keep("impact-none")
			d.Remove("impact-list")
		} else {
			d.Remove("impact-none")
			d.Keep("impact-list")
			d.Repeat("impact", len(impact), func(i int, row *page.Row) {
				row.Class("impact-line", "text-secondary", !impact[i].warn)
				row.Class("impact-line", "text-primary", impact[i].warn)
				row.Text("impact-line", impact[i].text)
			})
		}
	}

	// The open ledger lines, at the versions read here. A failed read says so.
	switch {
	case !dv.linesOK:
		d.Keep("cancel-lines-unavailable")
		d.Remove("cancel-lines")
	case len(dv.lines) == 0:
		d.Remove("cancel-lines-unavailable")
		d.Remove("cancel-lines")
	default:
		d.Remove("cancel-lines-unavailable")
		d.Keep("cancel-lines")
		d.Repeat("cancel-line", len(dv.lines), func(i int, row *page.Row) {
			l := dv.lines[i]
			row.Attr("cl-value", "value", l.id+":"+strconv.Itoa(l.version))
			row.Text("cl-text", l.supplier+" · "+l.status+" · "+l.amountTxt)
		})
		// On by default when cancelling; off on "Save details", where an open line was most
		// often reopened on purpose.
		closeLines := !editing
		if cf != nil {
			closeLines = cf.closeLines
		}
		d.Keep("cancel-close")
		d.Bool("cancel-close", "checked", closeLines)
		d.Text("cancel-close-label", cancelLinesCheckbox(len(dv.lines)))
	}

	reason, refund, detail := ov.cancellationReason, ov.refundStatus, ov.refundDetail
	if cf != nil {
		reason, refund, detail = cf.reason, cf.refundStatus, cf.refundDetail
	}
	d.Text("cancel-reason", reason)
	d.Repeat("refund-opt", len(refundStatuses), func(i int, row *page.Row) {
		s := refundStatuses[i]
		row.Attr("refund-opt", "value", s.value)
		row.Text("refund-opt", s.label)
		row.Bool("refund-opt", "selected", s.value == refund)
	})
	d.Attr("cancel-refund-detail", "value", detail)
	if strings.TrimSpace(reason) == "" {
		d.Keep("cancel-reason-hint")
	} else {
		d.Keep("cancel-reason-hint")
		d.Bool("cancel-reason-hint", "hidden", true)
	}
	if cf == nil || cf.err == "" {
		d.Remove("cancel-error")
	} else {
		d.Text("cancel-error", cf.err)
	}
	d.Text("cancel-submit", label)
	if editing {
		// The post must know which dialog this was, so its receipt says the right thing.
		d.Attr("cancel-submit", "name", "editing")
		d.Attr("cancel-submit", "value", "1")
	}
}
