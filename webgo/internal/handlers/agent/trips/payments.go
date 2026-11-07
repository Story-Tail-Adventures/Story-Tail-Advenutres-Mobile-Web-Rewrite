package trips

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/agentread"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 3.4.15 Trip Payment Schedule with §3.6's supplier pay links and Mark Paid, and
// §3.6.6 Payment History: app/(agent)/agent/trips/[tripId]/payments (page, actions, history)
// with PaymentScheduleTable, MilestoneForm, PayLinkDialog, MarkPaidDialog, MilestoneSummary.
//
// The open form and the dialogs live in the URL, as in Next: ?edit=<id> fills the form,
// ?link=<id> opens Add or edit pay link, ?paid=<id> opens Mark Paid (an open row only).
//
// PCI (CLAUDE.md rules 1, 2, 4): no card field anywhere; the pay link is https only and only
// this advisor page writes it, through agent-trip's payment_link (whose SQL writes the
// audit_event); the reference and note refuse a card-shaped number before anything is sent;
// paid_note shows only here, to the advisor, and in nothing a client reads.

func paymentsPath(tripID string) string { return tripPath(tripID) + "/payments" }

// scrubLink is what a refused pay link field may show again: nothing when the link holds a
// card-shaped number anywhere checkPayURL looks (its IDNA-normalised href included, so
// fullwidth digits or soft hyphens in the host cannot carry one back as ASCII).
func scrubLink(raw string) string {
	if noCard(raw) == "" || checkPayURL(raw).reason == "card" {
		return ""
	}
	return raw
}

// noCard is what a refused form may show again of a value: nothing, when it holds a
// card-shaped number. Next kept the typed text in the field (client state); a server-rendered
// page would be writing the number into HTML, which rule 1 forbids ("display").
func noCard(s string) string {
	if looksLikeCardNumber(s) {
		return ""
	}
	return s
}

// newMessageHref is messageQuery.ts newMessageHref: client, then trip, then remind.
func newMessageHref(clientID, tripID, milestoneID string) string {
	return "/agent/messages/new?client=" + url.QueryEscape(clientID) + "&trip=" + url.QueryEscape(tripID) +
		"&remind=" + url.QueryEscape(milestoneID)
}

type paymentsView struct {
	tripID   string
	ov       *overview
	payments []payment
	today    string

	editID    string // the row the form is on
	form      milestoneValues
	formErrs  map[string]string
	formError string

	linkRow   *payment
	linkValue string
	linkError string

	paidRow   *payment
	paid      markPaidValues
	paidErrs  map[string]string
	paidError string
}

func (pv *paymentsView) row(id string) *payment {
	for i := range pv.payments {
		if pv.payments[i].id == id {
			return &pv.payments[i]
		}
	}
	return nil
}

// milestoneEditValues is the page's editValues: the row unformatted, for the form.
func milestoneEditValues(p payment) milestoneValues {
	kind := p.kind
	if !isMilestoneKind(kind) {
		kind = "deposit"
	}
	return milestoneValues{milestoneID: p.id, kind: kind, label: p.label, amount: centsToDollars(Cents(p.amountCents), true), dueDate: p.dueDate}
}

// markPaidInitial is what Mark Paid opens with: what is still open on the row (or the whole
// amount when nothing is), the advisor's today, and what the row already holds.
func markPaidInitial(p payment, today string) markPaidValues {
	open := p.amountCents - p.paidCents
	if open <= 0 {
		open = p.amountCents
	}
	// The column CHECKs refuse a card-shaped value; noCard keeps the page honest regardless.
	return markPaidValues{amount: centsToDollars(Cents(open), true), paidOn: today, reference: noCard(p.paidReference), note: noCard(p.paidNote)}
}

var paymentsSlots = []string{
	"not-found", "trip", "back-link", "client-name", "title", "expected", "paid-total", "trip-total",
	"history-link", "remind-link", "remind-off", "schedule-empty", "schedule",
	"form-id", "form-heading", "form-error", "form-error-text", "kind-deposit", "kind-interim", "kind-final",
	"f-label", "f-label-error", "f-amount", "f-amount-hint", "f-amount-error", "f-due", "form-cancel", "milestone-form",
	"link-dialog", "link-form", "link-id", "link-heading", "link-input", "link-hint", "link-error",
	"link-preview", "link-button", "link-site", "link-remove", "link-cancel",
	"ls-label", "ls-context", "ls-amount", "ls-due",
	"paid-dialog", "paid-form", "paid-id", "paid-heading", "paid-error", "paid-error-text",
	"p-amount", "p-amount-error", "p-on", "p-on-error", "p-ref", "p-ref-error", "p-note", "p-note-hint", "p-note-error", "paid-cancel",
	"ps-label", "ps-context", "ps-amount", "ps-due",
}

var paymentsRowSlots = []string{
	"pay", "pr-label", "pr-meta", "pr-amount", "pr-paid", "pr-paid-text",
	"st-form", "st-id", "st-select", "st-scheduled", "st-paid", "st-overdue", "st-waived", "st-amount",
	"link-has", "link-title", "link-site-text", "link-travefy", "link-change", "link-none", "link-add", "link-add-sr",
	"mark-paid", "mark-paid-sr", "send-link", "send-link-sr", "send-off", "pr-edit", "pr-edit-sr", "rm-form", "rm-id", "rm-sr",
}

var historySlots = []string{"not-found", "trip", "h-title", "h-back", "h-chips", "h-all", "h-empty", "h-table"}

var paymentsSpecs = []page.Spec{
	spec("agent/trips/payments.html", paymentsSlots, map[string][]string{"pay": paymentsRowSlots}),
	spec("agent/trips/payment-history.html", historySlots, map[string][]string{
		"h-chip": {"h-chip", "h-chip-label"},
		"h-row":  {"h-row", "h-when", "h-kind", "h-payment", "h-detail", "h-who"},
	}),
}

type paymentsRenderer struct {
	d       handlers.Deps
	tmpl    *page.Template
	history *page.Template
}

// show renders the schedule. adjust runs after the URL's state, so a refused write can put
// back what was typed.
func (h paymentsRenderer) show(w http.ResponseWriter, r *http.Request, v visit, tripID string, status int, adjust func(*paymentsView)) {
	doc := h.tmpl.New()
	pv := &paymentsView{tripID: tripID, today: v.today()}
	st := stateBody
	notFound := false
	switch {
	case !v.canRead():
		st = stateRetry
	case !uuid.IsUUID(tripID):
		notFound = true
	default:
		var res overviewResult
		var rows []payment
		parallel(
			func() { res = loadOverview(r, h.d, v, tripID) },
			func() { rows = loadPayments(r, h.d, v, tripID) },
		)
		switch {
		case res.notFound:
			notFound = true
		case res.ov == nil || rows == nil:
			st = stateRetry
		default:
			pv.ov, pv.payments = res.ov, rows
		}
	}
	if notFound {
		status = http.StatusNotFound
	}
	if pv.ov != nil {
		pv.form = emptyMilestone()
		if r.Method == http.MethodGet {
			q := r.URL.Query()
			if p := pv.row(q.Get("edit")); q.Get("edit") != "" && p != nil {
				pv.editID, pv.form = p.id, milestoneEditValues(*p)
			}
			if p := pv.row(q.Get("link")); q.Get("link") != "" && p != nil {
				pv.linkRow, pv.linkValue = p, p.payURL
			}
			// Mark Paid is for a payment still open; a stale ?paid= on a settled row opens nothing.
			if p := pv.row(q.Get("paid")); q.Get("paid") != "" && p != nil && isOpenMilestone(p.status) {
				pv.paidRow, pv.paid = p, markPaidInitial(*p, pv.today)
			}
		}
		if adjust != nil {
			adjust(pv)
		}
	}
	if fillFrame(doc, r, v, st) {
		if notFound {
			doc.Keep("not-found")
			doc.Remove("trip")
		} else {
			doc.Remove("not-found")
			doc.Keep("trip")
			fillPaymentsPage(doc, pv)
		}
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

func mountPayments(rt *gate.Router, d handlers.Deps) error {
	tmpl, err := d.Pages.Template("agent/trips/payments.html")
	if err != nil {
		return err
	}
	history, err := d.Pages.Template("agent/trips/payment-history.html")
	if err != nil {
		return err
	}
	h := paymentsRenderer{d: d, tmpl: tmpl, history: history}

	rt.Protected("GET /agent/trips/{tripId}/payments", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.show(w, r, v, r.PathValue("tripId"), http.StatusOK, nil)
	}))
	rt.Protected("GET /agent/trips/{tripId}/payments/history", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, done := begin(w, r, d)
		if done {
			return
		}
		h.showHistory(w, r, v, r.PathValue("tripId"))
	}))

	post := func(pattern string, fn func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values)) {
		afterSignIn(rt, pattern, paymentsPath)
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
			v.here = paymentsPath(tripID)
			switch {
			case !uuid.IsUUID(tripID):
				h.show(w, r, v, tripID, http.StatusNotFound, nil)
			case v.noAccess:
				h.show(w, r, v, tripID, http.StatusForbidden, nil) // an admin: nothing is sent
			case !v.canRead():
				h.show(w, r, v, tripID, http.StatusServiceUnavailable, nil)
			default:
				fn(w, r, v, tripID, f)
			}
		}))
	}
	back := func(w http.ResponseWriter, r *http.Request, tripID string) { web.SeeOther(w, r, paymentsPath(tripID)) }

	// saveMilestoneAction: payment_upsert. Never carries a status or a paid amount.
	post("POST /agent/trips/{tripId}/payments/milestone", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		vals := milestoneFromForm(f)
		if vals.milestoneID != "" && !uuid.IsUUID(vals.milestoneID) {
			back(w, r, tripID) // not a row of any schedule: nothing to send
			return
		}
		again := func(status int, errs map[string]string, msg string) {
			shown := vals
			shown.label, shown.amount, shown.dueDate = noCard(vals.label), noCard(vals.amount), noCard(vals.dueDate)
			h.show(w, r, v, tripID, status, func(pv *paymentsView) {
				pv.form, pv.formErrs, pv.formError = shown, errs, msg
				pv.editID = ""
				if pv.row(vals.milestoneID) != nil {
					pv.editID = vals.milestoneID
				}
			})
		}
		if errs := validateMilestone(vals); len(errs) > 0 {
			again(http.StatusUnprocessableEntity, errs, "")
			return
		}
		cents, _ := dollarsToCents(vals.amount)
		body := map[string]any{"op": "payment_upsert", "tripId": tripID, "kind": vals.kind, "label": vals.label, "amountCents": cents}
		if vals.milestoneID != "" {
			body["milestoneId"] = vals.milestoneID
		}
		if vals.dueDate != "" {
			body["dueDate"] = vals.dueDate
		}
		out := outcome(call(r.Context(), d, r, v, "agent-trip", body), copyScheduleFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			back(w, r, tripID)
		default:
			again(out.Status, nil, out.Message)
		}
	})

	// setMilestoneStatusAction: payment_paid with the row's select and "amount that
	// arrived". Blank, or not a number, sends no amount: the function records the whole one.
	post("POST /agent/trips/{tripId}/payments/status", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		id, status := f.Get("milestoneId"), f.Get("status")
		if !uuid.IsUUID(id) || !isMilestoneStatus(status) {
			back(w, r, tripID)
			return
		}
		body := map[string]any{"op": "payment_paid", "tripId": tripID, "milestoneId": id, "status": status}
		if raw := trimJS(f.Get("paidAmount")); raw != "" {
			cents, ok := dollarsToCents(raw)
			switch {
			case ok:
				body["paidCents"] = cents
			case amountOverflows(raw):
				// Next sends the huge figure and the function refuses it: nothing changes. Left
				// out here it would read as "the whole amount" and mark the payment paid.
				back(w, r, tripID)
				return
			}
		}
		if call(r.Context(), d, r, v, "agent-trip", body).Kind == api.Unauthenticated {
			signIn(w, r, v)
			return
		}
		back(w, r, tripID)
	})

	// deleteMilestoneAction: payment_delete, a hard delete.
	post("POST /agent/trips/{tripId}/payments/delete", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		if id := f.Get("milestoneId"); uuid.IsUUID(id) {
			if call(r.Context(), d, r, v, "agent-trip", map[string]any{"op": "payment_delete", "tripId": tripID, "milestoneId": id}).Kind == api.Unauthenticated {
				signIn(w, r, v)
				return
			}
		}
		back(w, r, tripID)
	})

	// setPayLinkAction: payment_link. Checked here (https, length, card), then by the
	// function's new URL() and the column's CHECK; the SQL writes the audit row. Blank, or
	// intent=remove, removes the link.
	post("POST /agent/trips/{tripId}/payments/link", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		id := f.Get("milestoneId")
		raw := f.Get("payUrl")
		if f.Get("intent") == "remove" {
			raw = ""
		}
		again := func(status int, msg string) {
			h.show(w, r, v, tripID, status, func(pv *paymentsView) {
				pv.linkRow, pv.linkValue, pv.linkError = pv.row(id), scrubLink(raw), msg
			})
		}
		if !uuid.IsUUID(id) {
			again(http.StatusUnprocessableEntity, copyPaymentsFailed)
			return
		}
		link, msg := validatePayLink(raw)
		if msg != "" {
			again(http.StatusUnprocessableEntity, msg)
			return
		}
		var payURL any // null removes
		if link != "" {
			payURL = link
		}
		out := outcome(call(r.Context(), d, r, v, "agent-trip", map[string]any{"op": "payment_link", "tripId": tripID, "milestoneId": id, "payUrl": payURL}), copyPaymentsFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			back(w, r, tripID)
		default:
			again(out.Status, out.Message)
		}
	})

	// markPaidAction: payment_paid with status paid, the date it landed, and the
	// confirmation number and note (blank clears a stored one). Only the advisor does this.
	post("POST /agent/trips/{tripId}/payments/paid", func(w http.ResponseWriter, r *http.Request, v visit, tripID string, f url.Values) {
		id := f.Get("milestoneId")
		vals := markPaidFromForm(f)
		again := func(status int, errs map[string]string, msg string) {
			shown := vals
			shown.amount, shown.paidOn = noCard(vals.amount), noCard(vals.paidOn)
			shown.reference, shown.note = noCard(vals.reference), noCard(vals.note)
			h.show(w, r, v, tripID, status, func(pv *paymentsView) {
				pv.paidRow, pv.paid, pv.paidErrs, pv.paidError = pv.row(id), shown, errs, msg
			})
		}
		if !uuid.IsUUID(id) {
			again(http.StatusUnprocessableEntity, nil, copyPaymentsFailed)
			return
		}
		if errs := validateMarkPaid(vals, v.today()); len(errs) > 0 {
			again(http.StatusUnprocessableEntity, errs, "")
			return
		}
		body := map[string]any{"op": "payment_paid", "tripId": tripID, "milestoneId": id, "status": "paid",
			"paidOn": vals.paidOn, "paidReference": vals.reference, "paidNote": vals.note}
		if vals.amount != "" {
			if cents, ok := dollarsToCents(vals.amount); ok {
				body["paidCents"] = cents
			}
		}
		out := outcome(call(r.Context(), d, r, v, "agent-trip", body), copyPaymentsFailed)
		switch {
		case out.SignIn:
			signIn(w, r, v)
		case out.OK:
			back(w, r, tripID)
		default:
			again(out.Status, nil, out.Message)
		}
	})
	return nil
}

func fillPaymentsPage(d *page.Doc, pv *paymentsView) {
	ov, id := pv.ov, pv.tripID
	base := paymentsPath(id)
	d.URL("back-link", "href", tripPath(id))
	d.Text("client-name", ov.clientName)
	d.Text("title", ov.title)

	// What the schedule expects (nothing stores it: a schedule may be incomplete) and what is
	// on file, beside the trip's own total.
	var expected, paid int64
	for _, p := range pv.payments {
		expected += p.amountCents
		paid += p.paidCents
	}
	d.Text("expected", formatMoney(expected, true))
	d.Text("paid-total", formatMoney(paid, true))
	d.Text("trip-total", ov.totalValueLabel)

	d.URL("history-link", "href", base+"/history")
	if next, ok := nextUnpaid(pv.payments); ok {
		d.URL("remind-link", "href", newMessageHref(ov.clientID, id, next.id))
		d.Remove("remind-off")
	} else {
		d.Remove("remind-link")
		d.Keep("remind-off")
	}

	if len(pv.payments) == 0 {
		d.Keep("schedule-empty")
		d.Remove("schedule")
	} else {
		d.Remove("schedule-empty")
		d.Keep("schedule")
		d.Repeat("pay", len(pv.payments), func(i int, row *page.Row) { fillPaymentRow(row, pv, pv.payments[i]) })
	}

	fillMilestoneForm(d, pv)
	fillLinkDialog(d, pv)
	fillPaidDialog(d, pv)
}

func fillPaymentRow(row *page.Row, pv *paymentsView, p payment) {
	base := paymentsPath(pv.tripID)
	editing := p.id == pv.editID && pv.editID != ""
	row.Keep("pay")
	row.Class("pay", "trp-pay-editing", editing)
	if editing {
		row.Attr("pay", "aria-current", "true")
	}
	row.Text("pr-label", p.label)
	var meta []string
	if p.dueLabel != "" {
		meta = append(meta, "Due "+p.dueLabel)
	}
	if p.status == "paid" && p.paidOnLabel != "" {
		meta = append(meta, "Paid "+p.paidOnLabel)
	}
	if len(meta) == 0 {
		row.Text("pr-meta", "—")
	} else {
		row.Text("pr-meta", strings.Join(meta, " · "))
	}
	row.Text("pr-amount", p.amountLabel)
	partial := p.status == "paid" && p.paidLabel != p.amountLabel
	if partial {
		row.Keep("pr-paid")
		row.Text("pr-paid-text", p.paidLabel+" on file")
	} else {
		row.Remove("pr-paid")
	}

	// Status and what arrived: one form, so they cannot be sent apart.
	row.URL("st-form", "action", base+"/status")
	row.Attr("st-id", "value", p.id)
	row.Keep("st-select")
	row.Attr("st-select", "aria-label", "Mark this — "+p.label)
	for _, s := range []string{"scheduled", "paid", "overdue", "waived"} {
		row.Keep("st-" + s)
		row.Bool("st-"+s, "selected", p.status == s)
	}
	row.Attr("st-amount", "aria-label", "Amount that arrived — "+p.label)
	// Prefilled only on a partial paid row; anywhere else it would read as a payment on file.
	if partial {
		row.Attr("st-amount", "value", centsToDollars(Cents(p.paidCents), true))
	} else {
		row.Attr("st-amount", "value", "")
	}

	// The pay link, by its site name, the full link in the title.
	if p.paySite != "" && p.payURL != "" {
		row.Keep("link-has")
		row.Remove("link-none")
		row.Keep("link-title")
		row.Attr("link-title", "title", p.payURL)
		row.Text("link-site-text", p.paySite)
		if p.isTravefy {
			row.Keep("link-travefy")
		} else {
			row.Remove("link-travefy")
		}
		row.URL("link-change", "href", base+"?link="+url.QueryEscape(p.id))
		row.Attr("link-change", "aria-label", "Change the "+p.label+" pay link")
	} else {
		row.Remove("link-has")
		row.Keep("link-none")
		row.URL("link-add", "href", base+"?link="+url.QueryEscape(p.id))
		row.Text("link-add-sr", " — "+p.label)
	}

	if isOpenMilestone(p.status) {
		row.URL("mark-paid", "href", base+"?paid="+url.QueryEscape(p.id))
		row.Text("mark-paid-sr", " — "+p.label)
		if p.payURL != "" {
			row.URL("send-link", "href", newMessageHref(pv.ov.clientID, pv.tripID, p.id))
			row.Text("send-link-sr", " — "+p.label)
			row.Remove("send-off")
		} else {
			row.Remove("send-link")
			row.Keep("send-off")
		}
	} else {
		row.Remove("mark-paid")
		row.Remove("send-link")
		row.Remove("send-off")
	}
	row.URL("pr-edit", "href", base+"?edit="+url.QueryEscape(p.id))
	row.Text("pr-edit-sr", " "+p.label)
	row.URL("rm-form", "action", base+"/delete")
	row.Attr("rm-id", "value", p.id)
	row.Text("rm-sr", "Remove "+p.label+" — "+copyRemoveMilestone)
}

func fillMilestoneForm(d *page.Doc, pv *paymentsView) {
	v := pv.form
	d.URL("milestone-form", "action", paymentsPath(pv.tripID)+"/milestone")
	if v.milestoneID != "" {
		d.Attr("form-id", "value", v.milestoneID)
		d.Text("form-heading", "Edit this payment")
		d.URL("form-cancel", "href", paymentsPath(pv.tripID))
	} else {
		d.Remove("form-id")
		d.Text("form-heading", "Add a payment")
		d.Remove("form-cancel")
	}
	formError(d, "form-error", "form-error-text", pv.formError)
	for _, k := range []string{"deposit", "interim", "final"} {
		d.Keep("kind-" + k)
		d.Bool("kind-"+k, "selected", v.kind == k)
	}
	d.Attr("f-label", "value", v.label)
	if e := pv.formErrs["label"]; e != "" {
		d.Text("f-label-error", e)
		d.Attr("f-label", "aria-invalid", "true")
		d.Attr("f-label", "aria-describedby", "milestone-label-error")
	} else {
		d.Remove("f-label-error")
	}
	d.Attr("f-amount", "value", v.amount)
	if e := pv.formErrs["amount"]; e != "" {
		d.Remove("f-amount-hint")
		d.Text("f-amount-error", e)
		d.Attr("f-amount", "aria-invalid", "true")
		d.Attr("f-amount", "aria-describedby", "milestone-amount-error")
	} else {
		d.Keep("f-amount-hint")
		d.Remove("f-amount-error")
	}
	d.Attr("f-due", "value", v.dueDate)
}

// summaryFor fills MilestoneSummary: the row, and the trip and client it belongs to.
func summaryFor(d *page.Doc, prefix string, pv *paymentsView, p *payment) {
	d.Text(prefix+"-label", p.label)
	d.Text(prefix+"-context", pv.ov.title+" · "+pv.ov.clientName)
	d.Text(prefix+"-amount", p.amountLabel)
	if p.dueLabel == "" {
		d.Remove(prefix + "-due")
	} else {
		d.Text(prefix+"-due", "due "+p.dueLabel)
	}
}

func fillLinkDialog(d *page.Doc, pv *paymentsView) {
	p := pv.linkRow
	if p == nil {
		d.Remove("link-dialog")
		return
	}
	base := paymentsPath(pv.tripID)
	d.Keep("link-dialog")
	d.Attr("link-dialog", "data-trp-close-href", base)
	d.URL("link-form", "action", base+"/link")
	d.Attr("link-id", "value", p.id)
	if p.payURL != "" {
		d.Text("link-heading", "Edit pay link")
		d.Keep("link-remove")
	} else {
		d.Text("link-heading", "Add a pay link")
		d.Remove("link-remove")
	}
	summaryFor(d, "ls", pv, p)
	d.Attr("link-input", "value", pv.linkValue)
	if pv.linkError != "" {
		d.Remove("link-hint")
		d.Text("link-error", pv.linkError)
		d.Attr("link-input", "aria-invalid", "true")
		d.Attr("link-input", "aria-describedby", "pay-url-error")
	} else {
		d.Keep("link-hint")
		d.Remove("link-error")
	}
	// The preview names the site exactly as the client will see it; the page's module keeps
	// it in step with what is typed.
	d.Attr("link-preview", "data-trp-label", p.label)
	d.Text("link-button", payButtonLabel(p.label)+" ")
	if site := paySiteName(trimJS(pv.linkValue)); site != "" {
		d.Keep("link-preview")
		d.Text("link-site", site)
	} else {
		d.Bool("link-preview", "hidden", true)
		d.Keep("link-preview")
		d.Text("link-site", "")
	}
	d.URL("link-cancel", "href", base)
}

func fillPaidDialog(d *page.Doc, pv *paymentsView) {
	p := pv.paidRow
	if p == nil {
		d.Remove("paid-dialog")
		return
	}
	base := paymentsPath(pv.tripID)
	v := pv.paid
	d.Keep("paid-dialog")
	d.Attr("paid-dialog", "data-trp-close-href", base)
	d.URL("paid-form", "action", base+"/paid")
	d.Attr("paid-id", "value", p.id)
	d.Text("paid-heading", paidTitle(p.label))
	summaryFor(d, "ps", pv, p)
	formError(d, "paid-error", "paid-error-text", pv.paidError)
	field := func(slot, errSlot, errID, key, value string) {
		d.Attr(slot, "value", value)
		if e := pv.paidErrs[key]; e != "" {
			d.Text(errSlot, e)
			d.Attr(slot, "aria-invalid", "true")
			d.Attr(slot, "aria-describedby", errID)
		} else {
			d.Remove(errSlot)
		}
	}
	field("p-amount", "p-amount-error", "paid-amount-error", "amount", v.amount)
	field("p-on", "p-on-error", "paid-on-error", "paidOn", v.paidOn)
	d.Attr("p-on", "max", pv.today)
	field("p-ref", "p-ref-error", "paid-reference-error", "reference", v.reference)
	d.Text("p-note", v.note)
	if e := pv.paidErrs["note"]; e != "" {
		d.Remove("p-note-hint")
		d.Text("p-note-error", e)
		d.Attr("p-note", "aria-invalid", "true")
		d.Attr("p-note", "aria-describedby", "paid-note-error")
	} else {
		d.Keep("p-note-hint")
		d.Remove("p-note-error")
	}
	d.URL("paid-cancel", "href", base)
}

// ── §3.6.6 Payment History ──────────────────────────────────────────────────────────────

func loadPaymentHistory(r *http.Request, d handlers.Deps, v visit, tripID string) []historyEntry {
	rows, err := agentread.Call[historyRow](r.Context(), d.Supa, v.st, "agent_trip_payment_history", tripArgs{tripID}, d.Log)
	if err != nil {
		return nil
	}
	return toPaymentHistory(rows, v.loc)
}

func (h paymentsRenderer) showHistory(w http.ResponseWriter, r *http.Request, v visit, tripID string) {
	doc := h.history.New()
	status := http.StatusOK
	st := stateBody
	notFound := false
	var (
		ov       *overview
		entries  []historyEntry
		payments []payment
	)
	switch {
	case !v.canRead():
		st = stateRetry
	case !uuid.IsUUID(tripID):
		notFound = true
	default:
		var res overviewResult
		parallel(
			func() { res = loadOverview(r, h.d, v, tripID) },
			func() { entries = loadPaymentHistory(r, h.d, v, tripID) },
			func() { payments = loadPayments(r, h.d, v, tripID) },
		)
		switch {
		case res.notFound:
			notFound = true
		case res.ov == nil || entries == nil:
			st = stateRetry
		default:
			ov = res.ov
		}
	}
	if notFound {
		status = http.StatusNotFound
	}
	if fillFrame(doc, r, v, st) {
		if notFound {
			doc.Keep("not-found")
			doc.Remove("trip")
		} else {
			doc.Remove("not-found")
			doc.Keep("trip")
			fillHistory(doc, tripID, ov, entries, payments, r.URL.Query().Get("m"))
		}
	}
	web.Render(w, h.d.Log, doc, status, web.Private)
}

func fillHistory(d *page.Doc, tripID string, ov *overview, entries []historyEntry, payments []payment, m string) {
	base := paymentsPath(tripID)
	filter := ""
	if uuid.IsUUID(m) {
		filter = strings.ToLower(m)
	}
	d.Text("h-title", "Payment history · "+ov.title)
	d.URL("h-back", "href", base)

	if len(payments) == 0 {
		d.Remove("h-chips")
	} else {
		d.Keep("h-chips")
		// The chosen chip is filled secondary, the rest outlined (Chip color/variant).
		all := filter == ""
		d.URL("h-all", "href", base+"/history")
		d.Class("h-all", "chip-outlined", !all)
		d.Class("h-all", "chip-secondary", all)
		if all {
			d.Attr("h-all", "aria-current", "page")
		}
		d.Repeat("h-chip", len(payments), func(i int, row *page.Row) {
			p := payments[i]
			on := filter == strings.ToLower(p.id)
			row.URL("h-chip", "href", base+"/history?m="+url.QueryEscape(p.id))
			row.Text("h-chip-label", p.label)
			row.Class("h-chip", "chip-outlined", !on)
			row.Class("h-chip", "chip-secondary", on)
			if on {
				row.Attr("h-chip", "aria-current", "page")
			}
		})
	}

	var rows []historyEntry
	for _, e := range entries {
		if filter == "" || strings.ToLower(e.milestoneID) == filter {
			rows = append(rows, e)
		}
	}
	if len(rows) == 0 {
		d.Keep("h-empty")
		d.Remove("h-table")
		return
	}
	d.Remove("h-empty")
	d.Keep("h-table")
	d.Repeat("h-row", len(rows), func(i int, row *page.Row) {
		e := rows[i]
		row.Keep("h-row")
		row.Text("h-when", e.whenLabel)
		setStatusChip(row, "h-kind", e.chip, e.kindLabel)
		row.Text("h-payment", e.milestoneLabel)
		row.Text("h-detail", e.detail)
		row.Text("h-who", e.who)
	})
}
