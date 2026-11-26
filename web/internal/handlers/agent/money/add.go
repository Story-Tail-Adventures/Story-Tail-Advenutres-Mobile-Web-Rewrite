package money

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 3.7.4 — Add Commission Entry. A port of
// app/(agent)/agent/commission/ledger/new/page.tsx and createLineAction.
//
// A PAGE, WHERE THE ARTBOARD DRAWS A 540px MODAL — the precedent §3.4.3 set for New Trip.
// The modal's first field is "Linked trip · Search trips…", which as a page is a GET search
// that lands on ?trip=, and from there the trip is fixed: the supplier picker can fill gross
// and rate from THAT trip's bookings, which a modal over the ledger had no trip to read from.
// Trip Detail's cost card links straight to ?trip=.
//
// TWO STEPS, ONE ROUTE. Step 1 picks the trip; step 2 is the line form. Both are the same
// URL with the trip in the query, so the back button means what it says.

// addPath is §3.7.4's route.
const addPath = ledgerPath + "/new"

// tripRosterRow is the part of agent_trip_roster the trip picker reads.
type tripRosterRow struct {
	TripID            string  `json:"trip_id"`
	Title             string  `json:"title"`
	ClientDisplayName string  `json:"client_display_name"`
	Status            string  `json:"status"`
	StartDate         *string `json:"start_date"`
}

// tripOverviewRow is the part of agent_trip_overview the chosen trip's header reads.
type tripOverviewRow struct {
	TripID            string `json:"trip_id"`
	Title             string `json:"title"`
	ClientDisplayName string `json:"client_display_name"`
	Currency          string `json:"currency"`
}

// tripPick is one row of the picker (TripPick).
type tripPick struct {
	TripID string
	Title  string
	Meta   string
}

// addTripStatuses are the trips a line can be filed against: every live trip in the book,
// whatever its stage — a cancelled trip can owe a `lost` line, and a completed one is where
// most lines land.
var addTripStatuses = []string{"inquiry", "proposal", "booked", "in_progress", "completed", "cancelled"}

// searchTripsForLine ports it. ok is false when the read failed.
func (a *app) searchTripsForLine(ctx context.Context, v visit, search string) ([]tripPick, bool) {
	var rows []tripRosterRow
	rs := a.reads(ctx, v)
	args := map[string]any{
		"p_status": addTripStatuses, "p_client_id": nil, "p_search": nil,
		"p_limit": 25, "p_offset": 0,
	}
	if search != "" {
		args["p_search"] = search
	}
	read(rs, "agent_trip_roster", args, &rows)
	if rs.wait() != nil {
		return nil, false
	}
	out := make([]tripPick, 0, len(rows))
	for _, r := range rows {
		parts := []string{r.ClientDisplayName}
		if r.StartDate != nil {
			if label := travelDateLabel(*r.StartDate); label != "" {
				parts = append(parts, label)
			}
		}
		// The roster's own word, spaced rather than underscored, as the TypeScript does it.
		if r.Status != "" {
			parts = append(parts, spaceUnderscores(r.Status))
		}
		out = append(out, tripPick{TripID: r.TripID, Title: r.Title, Meta: joinDot(parts)})
	}
	return out, true
}

func spaceUnderscores(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] == '_' {
			b[i] = ' '
			break // replace("_", " ") in JS changes the FIRST one only.
		}
	}
	return string(b)
}

func joinDot(parts []string) string {
	out := ""
	for _, p := range parts {
		if p == "" {
			continue
		}
		if out != "" {
			out += " · "
		}
		out += p
	}
	return out
}

// addLineForm is what step 2 needs (AddLineForm).
type addLineForm struct {
	TripID     string
	TripTitle  string
	ClientName string
	Suppliers  []supplierGroup
	// Prefill is keyed by supplier id: what that supplier's components on this trip add up to.
	Prefill map[string]supplierPrefill
	Found   bool
}

// loadAddLineForm reads the trip, its components and the suppliers at once. ok is false when
// a read failed; Found is false when the trip is not one of this advisor's.
func (a *app) loadAddLineForm(ctx context.Context, v visit, tripID string) (addLineForm, bool) {
	var (
		trips      []tripOverviewRow
		components []componentRow
		suppliers  []supplierCatalogRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_trip_overview", map[string]any{"p_trip_id": tripID}, &trips)
	read(rs, "agent_trip_components", map[string]any{"p_trip_id": tripID}, &components)
	read(rs, "agent_suppliers", map[string]any{}, &suppliers)
	if rs.wait() != nil {
		return addLineForm{}, false
	}
	out := addLineForm{Suppliers: groupSuppliers(suppliers), Prefill: prefillBySupplier(components)}
	if len(trips) == 0 {
		return out, true
	}
	out.TripID, out.TripTitle, out.ClientName, out.Found =
		trips[0].TripID, trips[0].Title, trips[0].ClientDisplayName, true
	return out, true
}

// emptyLine is EMPTY_LINE: a new line starts empty, and the supplier fills in what it knows.
var emptyLine = lineValues{PaymentTerms: "after_travel", Status: "expected"}

var addSpec = page.Spec{
	File:   "agent/money/add.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"not-found",
		"pick", "pick-form", "pick-q", "pick-none", "pick-list",
		"chosen", "chosen-trip", "chosen-client", "chosen-change",
		"line-form-card", "line-form", "line-trip-id",
		"form-error", "form-error-text", "no-suppliers",
		"supplier-select", "supplier-error",
		"gross-value", "gross-error", "gross-hint",
		"rate-value", "rate-error", "rate-hint",
		"expected-readout",
		"terms-after-travel", "terms-at-booking", "lag-value", "lag-error", "lag-hint",
		"reference-value", "reference-error", "notes-value", "cancel",
	),
	Repeats: map[string][]string{
		"trip-pick":     {"trip-pick-link", "trip-pick-title", "trip-pick-meta"},
		"supplier-pick": {"supplier-pick"},
		"status-pick":   {"status-pick"},
	},
}

// addRender is one answer's own state.
type addRender struct {
	values lineValues
	errs   fieldErrors
	msg    string
}

// firstValue is Next's `first()`: a repeated parameter arrives as an array, and `?q=a&q=b`
// used to 500 on .trim().
func firstValue(q url.Values, key string) string { return q.Get(key) }

func (a *app) serveAddLine(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	a.renderAdd(w, r, v, addRender{}, http.StatusOK)
}

func (a *app) renderAdd(w http.ResponseWriter, r *http.Request, v visit, rend addRender, status int) {
	q := r.URL.Query()
	tripID := firstValue(q, "trip")
	if !isUUID(tripID) {
		tripID = ""
	}
	search := strings.TrimSpace(firstValue(q, "q"))

	var (
		form  addLineForm
		trips []tripPick
		ok    = true
	)
	if v.canRead() {
		if tripID != "" {
			form, ok = a.loadAddLineForm(r.Context(), v, tripID)
		} else {
			trips, ok = a.searchTripsForLine(r.Context(), v, search)
		}
	}
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case !ok:
		st = stateRetry
	}
	switch {
	case st != stateBody:
		status = statusFor(st)
	case tripID != "" && !form.Found:
		status = http.StatusNotFound
	case status == 0:
		status = http.StatusOK
	}

	doc := a.add.New()
	if fillFrame(doc, r, v, st) {
		fillAdd(doc, tripID, search, form, trips, rend)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillAdd(doc *page.Doc, tripID, search string, form addLineForm, trips []tripPick, rend addRender) {
	// ── Step 2: a trip is chosen ────────────────────────────────────────────
	if tripID != "" {
		doc.Remove("pick")
		if !form.Found {
			doc.Keep("not-found")
			doc.Remove("chosen")
			doc.Remove("line-form-card")
			return
		}
		doc.Remove("not-found")
		doc.Keep("chosen")
		doc.Text("chosen-trip", form.TripTitle)
		doc.Text("chosen-client", form.ClientName)
		doc.URL("chosen-change", "href", addPath)

		values := rend.values
		if values == (lineValues{}) {
			values = emptyLine
		}
		doc.Keep("line-form-card")
		doc.URL("line-form", "action", addPath+"?trip="+url.QueryEscape(form.TripID))
		doc.Attr("line-trip-id", "value", form.TripID)
		message(doc, "form-error", "form-error-text", rend.msg)
		keepIf(doc, "no-suppliers", !anySupplier(form.Suppliers))
		fillSupplierPicker(doc, flattenSuppliers(form.Suppliers), values.SupplierID, &form)
		fillLineFields(doc, values, rend.errs)
		fillStatusPicker(doc, createStatusOptions, values.Status)
		doc.URL("cancel", "href", ledgerPath+"?trip="+url.QueryEscape(form.TripID))
		return
	}

	// ── Step 1: pick the trip ───────────────────────────────────────────────
	doc.Remove("not-found")
	doc.Remove("chosen")
	doc.Remove("line-form-card")
	doc.Keep("pick")
	doc.URL("pick-form", "action", addPath)
	doc.Attr("pick-q", "value", search)
	if len(trips) == 0 {
		doc.Keep("pick-none")
		doc.Remove("pick-list")
		return
	}
	doc.Remove("pick-none")
	doc.Keep("pick-list")
	doc.Repeat("trip-pick", len(trips), func(i int, row *page.Row) {
		t := trips[i]
		row.URL("trip-pick-link", "href", addPath+"?trip="+url.QueryEscape(t.TripID))
		row.Text("trip-pick-title", t.Title)
		row.Text("trip-pick-meta", t.Meta)
	})
}

// createLine is 3.7.4's save. On success the advisor lands on the new line.
func (a *app) createLine(w http.ResponseWriter, r *http.Request, v visit, f form) {
	values := lineValuesFromForm(f)
	tripID := f.Get("tripId")
	if tripID == "" {
		a.renderAdd(w, r, v, addRender{values: values, msg: copySaveFailed}, http.StatusUnprocessableEntity)
		return
	}
	if errs := validateLine(values); errs != nil {
		a.renderAdd(w, r, v, addRender{values: values, errs: errs}, http.StatusUnprocessableEntity)
		return
	}
	status := values.Status
	if status == "" {
		status = "expected"
	}
	body := lineBody(values)
	body["op"] = "create"
	body["tripId"] = tripID
	body["status"] = status

	res := a.call(r, v, "agent-commission", body)
	out := web.FromResult(res, copySaveFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, addPath+"?trip="+url.QueryEscape(tripID))
			return
		}
		a.renderAdd(w, r, v, addRender{values: values, msg: out.Message}, out.Status)
		return
	}
	outcome := decodeOutcome(res.Data)
	if errs := outcomeFieldError(outcome.Outcome); errs != nil {
		a.renderAdd(w, r, v, addRender{values: values, errs: errs}, http.StatusUnprocessableEntity)
		return
	}
	if outcome.CommissionID == "" {
		web.SeeOther(w, r, ledgerPath)
		return
	}
	web.SeeOther(w, r, linePath(outcome.CommissionID))
}

func (a *app) postAddLine(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	a.createLine(w, r, v, f)
}
