package money

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 3.7.3 — Commission Detail / Edit. A port of
// app/(agent)/agent/commission/ledger/[commissionId]/page.tsx with CommissionLineForm,
// CommissionPaymentForm and CommissionRemoveButton, and of ledger/actions.ts's three writes.
//
// §4.4 Pattern C: the record on the left, its actions on the right.
//
// THREE WRITES, ONE ROUTE. React had three server actions; here one POST carries an `op`
// field, because a browser form posts to one URL. They stay as separate as the actions were:
// `update` says what was booked and what is owed, `payment` is the ONLY door to received or
// disputed, and `remove` takes a mistake off the ledger.
//
// EXPECTED IS NOT A FIELD, as in the TypeScript: it is a read-out of gross × rate, because
// the server computes the stored figure itself and refuses one that disagrees. Without
// JavaScript it is the saved figure; the module beside the form keeps it in step as you type.
//
// STALENESS IS READ OFF `conflict`, never off the English sentence the function wrote.

// commissionLineRow is one row of agent_commission_line.
type commissionLineRow struct {
	CommissionID            string  `json:"commission_id"`
	TripID                  string  `json:"trip_id"`
	TripTitle               string  `json:"trip_title"`
	TripArchived            bool    `json:"trip_archived"`
	ClientDisplayName       string  `json:"client_display_name"`
	SupplierID              string  `json:"supplier_id"`
	SupplierName            string  `json:"supplier_name"`
	GrossBookingCents       Cents   `json:"gross_booking_cents"`
	CommissionPct           Rate    `json:"commission_pct"`
	ExpectedCommissionCents Cents   `json:"expected_commission_cents"`
	ProcessingFeeCents      Cents   `json:"processing_fee_cents"`
	ReceivedCommissionCents Cents   `json:"received_commission_cents"`
	Currency                string  `json:"currency"`
	PaymentTerms            string  `json:"payment_terms"`
	PaymentLagDays          int     `json:"payment_lag_days"`
	ExpectedPaymentDate     *string `json:"expected_payment_date"`
	Status                  string  `json:"status"`
	ReceivedAt              *string `json:"received_at"`
	InteletravelReference   *string `json:"inteletravel_reference"`
	Notes                   *string `json:"notes"`
	Version                 int     `json:"version"`
	CanRemove               bool    `json:"can_remove"`
	AsOfDate                string  `json:"as_of_date"`
}

// commissionLine is CommissionLineView.
type commissionLine struct {
	CommissionID string
	Version      int
	TripID       string
	// TripHref is "" for an archived trip: Trip Detail will not open it.
	TripHref     string
	ClientName   string
	SupplierName string
	// Heading is "Sandals Resorts · Kyoto in the spring · $1,368 expected".
	Heading       string
	Status        string
	StatusChip    string
	StatusLabel   string
	IsPaid        bool
	ExpectedCents Cents
	// PaidLine is "Received $1,190 on Feb 21, 2027, after a $12 fee." — a paid line only.
	PaidLine  string
	TermsLine string
	// ExpectationLine is "Expected around Oct 18, 2026." — or why there is no date yet.
	ExpectationLine string
	CanRemove       bool
	// Today is the advisor's own, from the accessor: the payment date's ceiling.
	Today         string
	LineValues    lineValues
	PaymentValues paymentValues
}

// lineView ports it.
func lineView(r commissionLineRow) commissionLine {
	known, isKnown := statusByValue(r.Status)
	isPaid := r.Status == "received" || r.Status == "disputed"

	expectation := copyExpectationNoEnd
	switch {
	case r.ExpectedPaymentDate != nil && travelDateLabel(*r.ExpectedPaymentDate) != "":
		expectation = commissionExpectedOn(travelDateLabel(*r.ExpectedPaymentDate))
	case r.PaymentTerms == "at_booking":
		expectation = copyExpectationNotBooked
	}

	out := commissionLine{
		CommissionID:    r.CommissionID,
		Version:         r.Version,
		TripID:          r.TripID,
		ClientName:      r.ClientDisplayName,
		SupplierName:    r.SupplierName,
		Heading:         commissionLineHeading(r.SupplierName, r.TripTitle, money(r.ExpectedCommissionCents)),
		Status:          r.Status,
		StatusChip:      "unknown",
		StatusLabel:     r.Status,
		IsPaid:          isPaid,
		ExpectedCents:   r.ExpectedCommissionCents,
		TermsLine:       commissionTermsLine(r.SupplierName, r.PaymentTerms, r.PaymentLagDays),
		ExpectationLine: expectation,
		CanRemove:       r.CanRemove,
		Today:           r.AsOfDate,
		LineValues: lineValues{
			SupplierID:            r.SupplierID,
			Gross:                 centsToDollars(r.GrossBookingCents),
			Rate:                  rateInput(r.CommissionPct),
			PaymentTerms:          r.PaymentTerms,
			PaymentLagDays:        itoa(r.PaymentLagDays),
			Status:                r.Status,
			InteletravelReference: str(r.InteletravelReference),
			Notes:                 str(r.Notes),
		},
	}
	if !r.TripArchived {
		out.TripHref = "/agent/trips/" + r.TripID
	}
	if isKnown {
		out.StatusChip, out.StatusLabel = known.Chip, known.Label
	}
	// To the cent: this is the record of what arrived, beside a form that shows cents. In
	// whole dollars $1,189.50 reads as $1,190 and a 40-cent fee as "a $0 fee".
	if isPaid && r.ReceivedAt != nil {
		fee := ""
		if r.ProcessingFeeCents > 0 {
			fee = moneyExact(r.ProcessingFeeCents)
		}
		when := travelDateLabel(*r.ReceivedAt)
		if when == "" {
			when = *r.ReceivedAt
		}
		out.PaidLine = commissionPaidLine(moneyExact(r.ReceivedCommissionCents), when, fee)
	}
	if isPaid {
		out.PaymentValues = paymentValues{
			Status:     r.Status,
			Received:   centsToDollars(r.ReceivedCommissionCents),
			Fee:        centsToDollars(r.ProcessingFeeCents),
			ReceivedAt: str(r.ReceivedAt),
		}
		if out.PaymentValues.ReceivedAt == "" {
			out.PaymentValues.ReceivedAt = r.AsOfDate
		}
	} else {
		// Unpaid: the amount starts BLANK. Pre-filling expected-in-full meant Enter in any
		// field recorded a full payment nobody had checked against the statement.
		out.PaymentValues = paymentValues{Status: "received", Received: "", Fee: "0.00", ReceivedAt: r.AsOfDate}
	}
	return out
}

// rateInput is String(Number(r.commission_pct)): the rate as a form value, with no trailing
// zeros — "12.5", not "12.50". A missing rate is "0", the way Number(null) would be, because
// this is an input the advisor is about to correct, not a figure on a tile.
func rateInput(r Rate) string {
	if !r.Set {
		return "0"
	}
	return trimZeros(toFixed(r.Value, 2))
}

func trimZeros(s string) string {
	if !hasDot(s) {
		return s
	}
	for len(s) > 0 && s[len(s)-1] == '0' {
		s = s[:len(s)-1]
	}
	if len(s) > 0 && s[len(s)-1] == '.' {
		s = s[:len(s)-1]
	}
	return s
}

func hasDot(s string) bool {
	for i := range s {
		if s[i] == '.' {
			return true
		}
	}
	return false
}

// ── The read ────────────────────────────────────────────────────────────────────────────

// lineLoad is what one detail render needs. Found is false for "not yours", "removed" or
// "never existed", which are deliberately indistinguishable.
type lineLoad struct {
	Line      commissionLine
	Found     bool
	Suppliers []supplierGroup
}

// loadLine reads the line and the supplier picker at once. ok is false when a read failed.
func (a *app) loadLine(ctx context.Context, v visit, commissionID string) (lineLoad, bool) {
	var (
		rows      []commissionLineRow
		suppliers []supplierCatalogRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_line", map[string]any{"p_commission_id": commissionID}, &rows)
	read(rs, "agent_suppliers", map[string]any{}, &suppliers)
	if rs.wait() != nil {
		return lineLoad{}, false
	}
	out := lineLoad{Suppliers: groupSuppliers(suppliers)}
	if len(rows) == 0 {
		return out, true
	}
	out.Line, out.Found = lineView(rows[0]), true

	// A line filed against a supplier that has since been archived must still be editable:
	// agent_suppliers() lists live suppliers only, so without this the picker opened on its
	// placeholder and `required` blocked even a notes-only save.
	if _, listed := findSupplier(out.Suppliers, out.Line.LineValues.SupplierID); !listed {
		out.Suppliers = append(out.Suppliers, supplierGroup{
			KindLabel: copySupplierNoLongerListed,
			Suppliers: []supplierOption{{
				SupplierID: out.Line.LineValues.SupplierID,
				Name:       out.Line.SupplierName,
				KindLabel:  copySupplierNoLongerListed,
			}},
		})
	}
	return out, true
}

// ── The page ────────────────────────────────────────────────────────────────────────────

var lineSpec = page.Spec{
	File:   "agent/money/line.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"not-found", "detail",
		"heading", "status-chip", "client-name", "trip-link", "trip-archived",
		"line-form", "line-id", "line-trip-id", "line-version",
		"form-error", "form-error-text",
		"clears-payment", "no-suppliers",
		"supplier-error", "gross-value", "gross-error", "gross-hint",
		"rate-value", "rate-error", "rate-hint",
		"expected-readout", "supplier-select",
		"terms-after-travel", "terms-at-booking", "lag-value", "lag-error", "lag-hint",
		"reference-value", "reference-error", "notes-value",
		"paid-line",
		"pay-form", "pay-id", "pay-trip-id", "pay-version",
		"pay-error", "pay-error-text",
		"pay-received", "pay-received-error",
		"pay-fee", "pay-fee-error", "pay-fee-hint",
		"pay-gap", "pay-received-at", "pay-received-at-error",
		"pay-status-received", "pay-status-disputed",
		"terms-line", "expectation-line",
		"remove", "remove-form", "remove-id", "remove-trip-id", "remove-version", "remove-error", "remove-error-text",
		"remove-not-allowed",
	),
	Repeats: map[string][]string{
		"supplier-pick": {"supplier-pick"},
		"status-pick":   {"status-pick"},
	},
}

// lineRender is everything one answer draws: the loaded line plus whatever the write it is
// answering had to say.
type lineRender struct {
	load lineLoad
	// values override the saved ones after a refused save, so nothing typed is lost.
	values lineValues
	// version is the version the advisor's PAGE carried, echoed back on a refusal.
	//
	// Without it the optimistic lock defeats itself: this handler re-reads the row to redraw
	// the page, so a refused save would be redrawn with the SERVER's version beside the
	// advisor's stale text — the retry would then be accepted and would overwrite the very
	// change the advisor was just warned about. React never had the problem, because its
	// hidden version came from a server component the failed action did not re-render.
	version     int
	hasVersion  bool
	pay         paymentValues
	lineErrors  fieldErrors
	payErrors   fieldErrors
	formError   string
	payError    string
	removeError string
}

func (a *app) serveLine(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	a.renderLine(w, r, v, r.PathValue("commissionId"), lineRender{}, http.StatusOK)
}

// renderLine loads the line and draws it. status is the answer's when the page renders at
// all; a failed read is always a 503 and a missing line always a 404.
func (a *app) renderLine(w http.ResponseWriter, r *http.Request, v visit, commissionID string, rend lineRender, status int) {
	ok := true
	if v.canRead() {
		// A malformed id would reach PostgREST as a 400 and read as "the ledger is down". It
		// is a bad link, so it gets the not-found answer without a round trip.
		if isUUID(commissionID) {
			rend.load, ok = a.loadLine(r.Context(), v, commissionID)
		} else {
			rend.load = lineLoad{}
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
	case !rend.load.Found:
		// A link to a line that is not yours, or is gone: not an outage, and not a 200 for
		// anything to cache.
		status = http.StatusNotFound
	case status == 0:
		status = http.StatusOK
	}
	doc := a.line.New()
	if fillFrame(doc, r, v, st) {
		fillLine(doc, rend)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillLine(doc *page.Doc, rend lineRender) {
	if !rend.load.Found {
		doc.Keep("not-found")
		doc.Remove("detail")
		// The pickers and the forms live inside `detail` and go with it.
		return
	}
	doc.Remove("not-found")
	doc.Keep("detail")

	line := rend.load.Line
	values := rend.values
	if values == (lineValues{}) {
		values = line.LineValues
	}
	pay := rend.pay
	if pay == (paymentValues{}) {
		pay = line.PaymentValues
	}

	doc.Text("heading", line.Heading)
	doc.Text("status-chip", line.StatusLabel)
	chipClass(doc, "status-chip", line.StatusChip)
	doc.Text("client-name", line.ClientName)
	if line.TripHref != "" {
		doc.URL("trip-link", "href", line.TripHref)
		doc.Remove("trip-archived")
	} else {
		doc.Remove("trip-link")
		doc.Keep("trip-archived")
	}

	// ── The line form ───────────────────────────────────────────────────────
	doc.URL("line-form", "action", linePath(line.CommissionID))
	doc.Attr("line-id", "value", line.CommissionID)
	doc.Attr("line-trip-id", "value", line.TripID)
	// The version the page was at, not the one the re-read just found. See lineRender.
	version := line.Version
	if rend.hasVersion {
		version = rend.version
	}
	doc.Attr("line-version", "value", itoa(version))
	message(doc, "form-error", "form-error-text", rend.formError)

	// Moving a paid line back to an unpaid status wipes the recorded payment (the SQL does
	// it, and audits it). The checkbox is REQUIRED, so the browser will not submit without
	// the advisor saying yes.
	clears := line.IsPaid && values.Status != "received" && values.Status != "disputed"
	keepIf(doc, "clears-payment", clears)
	keepIf(doc, "no-suppliers", !anySupplier(rend.load.Suppliers))

	fillSupplierPicker(doc, flattenSuppliers(rend.load.Suppliers), values.SupplierID, nil)
	fillLineFields(doc, values, rend.lineErrors)
	fillStatusPicker(doc, editStatusOptions(line.Status), values.Status)

	// ── The payment form ────────────────────────────────────────────────────
	textOrRemove(doc, "paid-line", line.PaidLine)
	doc.URL("pay-form", "action", linePath(line.CommissionID))
	doc.Attr("pay-id", "value", line.CommissionID)
	doc.Attr("pay-trip-id", "value", line.TripID)
	doc.Attr("pay-version", "value", itoa(version))
	message(doc, "pay-error", "pay-error-text", rend.payError)

	doc.Attr("pay-received", "value", pay.Received)
	errorOrHint(doc, "pay-received", "pay-received-error", "", rend.payErrors["received"])
	doc.Attr("pay-fee", "value", pay.Fee)
	errorOrHint(doc, "pay-fee", "pay-fee-error", "pay-fee-hint", rend.payErrors["fee"])
	doc.Attr("pay-received-at", "value", pay.ReceivedAt)
	doc.Attr("pay-received-at", "max", line.Today)
	errorOrHint(doc, "pay-received-at", "pay-received-at-error", "", rend.payErrors["receivedAt"])
	// The gap is the figure the advisor is checking against the statement. With no script it
	// is the gap for what is on file; the module keeps it in step as the amounts are typed.
	gap, hasGap := previewGapCents(line.ExpectedCents, pay.Received, pay.Fee)
	if hasGap && pay.Received != "" {
		doc.Text("pay-gap", commissionGapLine(gap, moneyExact(absCents(gap))))
	} else {
		doc.Text("pay-gap", "")
	}
	doc.Attr("pay-gap", "data-expected", itoa64(int64(line.ExpectedCents)))
	doc.Keep("pay-status-received")
	doc.Keep("pay-status-disputed")
	doc.Bool("pay-status-received", "checked", pay.Status != "disputed")
	doc.Bool("pay-status-disputed", "checked", pay.Status == "disputed")

	// ── The aside ───────────────────────────────────────────────────────────
	doc.Text("terms-line", line.TermsLine)
	doc.Text("expectation-line", line.ExpectationLine)

	if line.CanRemove {
		doc.Keep("remove")
		doc.Remove("remove-not-allowed")
		doc.URL("remove-form", "action", linePath(line.CommissionID))
		doc.Attr("remove-id", "value", line.CommissionID)
		doc.Attr("remove-trip-id", "value", line.TripID)
		doc.Attr("remove-version", "value", itoa(version))
		message(doc, "remove-error", "remove-error-text", rend.removeError)
	} else {
		doc.Remove("remove")
		doc.Keep("remove-not-allowed")
	}
}

// fillLineFields draws the shared line form's own inputs, which §3.7.4 draws too.
func fillLineFields(doc *page.Doc, values lineValues, errs fieldErrors) {
	doc.Keep("supplier-select")
	errorOrHint(doc, "supplier-select", "supplier-error", "", errs["supplierId"])

	doc.Attr("gross-value", "value", values.Gross)
	errorOrHint(doc, "gross-value", "gross-error", "gross-hint", errs["gross"])
	doc.Attr("rate-value", "value", values.Rate)
	errorOrHint(doc, "rate-value", "rate-error", "rate-hint", errs["rate"])
	doc.Attr("lag-value", "value", values.PaymentLagDays)
	errorOrHint(doc, "lag-value", "lag-error", "lag-hint", errs["paymentLagDays"])

	// Expected: gross × rate where both parse, and an EM DASH where either does not, which
	// is what CommissionLineForm renders for a null. Not "$0" — that is a figure, and on a
	// half-filled Add form a wrong one. On a saved line both always parse, so the dash only
	// shows after a refused save with something unparseable still in the field.
	if expected, ok := previewExpectedCents(values.Gross, values.Rate); ok {
		doc.Text("expected-readout", moneyExact(expected))
	} else {
		doc.Text("expected-readout", noFigure)
	}

	doc.Keep("terms-after-travel")
	doc.Keep("terms-at-booking")
	doc.Bool("terms-after-travel", "selected", values.PaymentTerms != "at_booking")
	doc.Bool("terms-at-booking", "selected", values.PaymentTerms == "at_booking")
	doc.Attr("reference-value", "value", values.InteletravelReference)
	errorOrHint(doc, "reference-value", "reference-error", "", errs["inteletravelReference"])
	doc.Text("notes-value", values.Notes)
}

func fillStatusPicker(doc *page.Doc, options []option, chosen string) {
	doc.Repeat("status-pick", len(options), func(i int, row *page.Row) {
		row.Text("status-pick", options[i].Label)
		row.Attr("status-pick", "value", options[i].Value)
		row.Bool("status-pick", "selected", options[i].Value == chosen)
	})
}

// ── The writes ──────────────────────────────────────────────────────────────────────────

// functionOutcome is what agent-commission answers with. TYPED, never a map: a JSON number
// read into `any` becomes a float64 and breaks the cents rule.
type functionOutcome struct {
	Outcome      string `json:"outcome"`
	CommissionID string `json:"commissionId"`
}

func decodeOutcome(raw json.RawMessage) functionOutcome {
	var out functionOutcome
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// saveLine is the one POST the detail page makes: update, payment or remove.
func (a *app) saveLine(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	commissionID := r.PathValue("commissionId")
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	switch f.Get("op") {
	case "payment":
		a.recordPayment(w, r, v, commissionID, f)
	case "remove":
		a.removeLine(w, r, v, commissionID, f)
	default:
		a.updateLine(w, r, v, commissionID, f)
	}
}

// signedOutTo sends the advisor back through sign-in to the page they were on.
func (a *app) signedOutTo(w http.ResponseWriter, r *http.Request, path string) {
	web.SeeOther(w, r, "/login?next="+url.QueryEscape(path))
}

func (a *app) updateLine(w http.ResponseWriter, r *http.Request, v visit, commissionID string, f form) {
	values := lineValuesFromForm(f)
	version, hasVersion := parseIntJS(f.Get("version"))
	echo := lineRender{values: values, version: version, hasVersion: hasVersion}
	if commissionID == "" || !hasVersion {
		echo.formError = copySaveFailed
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}
	if errs := validateLine(values); errs != nil {
		echo.lineErrors = errs
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}

	body := lineBody(values)
	body["op"] = "update"
	body["commissionId"] = commissionID
	body["expectedVersion"] = version
	body["status"] = values.Status
	// Only the required checkbox sends this. The server refuses to wipe a payment without it.
	body["clearPayment"] = f.Get("clearPayment") == "true"

	res := a.call(r, v, "agent-commission", body)
	out := web.FromResult(res, copySaveFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, linePath(commissionID))
			return
		}
		msg := out.Message
		if out.Conflict {
			msg = copyLineStale
		}
		echo.formError = msg
		a.renderLine(w, r, v, commissionID, echo, out.Status)
		return
	}
	switch outcome := decodeOutcome(res.Data).Outcome; outcome {
	case "duplicate_reference", "supplier_not_found":
		echo.lineErrors = outcomeFieldError(outcome)
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
	case "payment_would_clear":
		echo.formError = copyClearsPayment
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
	default:
		// Changed or a no-op alike: reload the line, so the form holds the server's version.
		web.SeeOther(w, r, linePath(commissionID))
	}
}

// outcomeFieldError is a 200 outcome that belongs against a field rather than at the top.
func outcomeFieldError(outcome string) fieldErrors {
	switch outcome {
	case "duplicate_reference":
		return fieldErrors{"inteletravelReference": copyDuplicateReference}
	case "supplier_not_found":
		return fieldErrors{"supplierId": copySupplierGone}
	}
	return nil
}

// lineBody is the line fields as the Edge Function takes them. Only called after validateLine.
func lineBody(values lineValues) map[string]any {
	gross, _ := dollarsToCents(values.Gross)
	pct, _ := parseRate(values.Rate)
	lag, _ := parseLagDays(values.PaymentLagDays)
	return map[string]any{
		"supplierId":            values.SupplierID,
		"grossCents":            int64(gross),
		"commissionPct":         pct,
		"paymentTerms":          values.PaymentTerms,
		"paymentLagDays":        lag,
		"inteletravelReference": values.InteletravelReference,
		"notes":                 values.Notes,
	}
}

// recordPayment is 3.7.3's "Mark received" — the only door to received and disputed.
func (a *app) recordPayment(w http.ResponseWriter, r *http.Request, v visit, commissionID string, f form) {
	values := paymentValuesFromForm(f)
	version, hasVersion := parseIntJS(f.Get("version"))
	echo := lineRender{pay: values, version: version, hasVersion: hasVersion}
	if commissionID == "" || !hasVersion {
		echo.payError = copySaveFailed
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}
	if errs := validatePayment(values); errs != nil {
		echo.payErrors = errs
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}
	received, _ := dollarsToCents(values.Received)
	fee, _ := dollarsToCents(values.Fee)
	status := "received"
	if values.Status == "disputed" {
		status = "disputed"
	}
	res := a.call(r, v, "agent-commission", map[string]any{
		"op":              "payment",
		"commissionId":    commissionID,
		"expectedVersion": version,
		"status":          status,
		"receivedCents":   int64(received),
		"feeCents":        int64(fee),
		"receivedAt":      values.ReceivedAt,
	})
	out := web.FromResult(res, copySaveFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, linePath(commissionID))
			return
		}
		msg := out.Message
		if out.Conflict {
			msg = copyLineStale
		}
		echo.payError = msg
		a.renderLine(w, r, v, commissionID, echo, out.Status)
		return
	}
	if decodeOutcome(res.Data).Outcome == "bad_date" {
		echo.payErrors = fieldErrors{"receivedAt": copyBadDate}
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}
	web.SeeOther(w, r, linePath(commissionID))
}

// removeLine takes a line entered by mistake off the ledger. Soft and audited in the
// database, but nothing on screen brings it back, so the form asks first.
func (a *app) removeLine(w http.ResponseWriter, r *http.Request, v visit, commissionID string, f form) {
	version, hasVersion := parseIntJS(f.Get("version"))
	echo := lineRender{version: version, hasVersion: hasVersion}
	if commissionID == "" || !hasVersion {
		echo.removeError = copySaveFailed
		a.renderLine(w, r, v, commissionID, echo, http.StatusUnprocessableEntity)
		return
	}
	res := a.call(r, v, "agent-commission", map[string]any{
		"op": "remove", "commissionId": commissionID, "expectedVersion": version,
	})
	out := web.FromResult(res, copySaveFailed)
	if out.SignIn {
		a.signedOutTo(w, r, linePath(commissionID))
		return
	}
	if out.OK && decodeOutcome(res.Data).Outcome == "removed" {
		web.SeeOther(w, r, ledgerPath)
		return
	}
	// A refusal is shown ON the line rather than closing over an unchanged one with no word
	// of why: it may have changed, or it may be a line that is on the record for good.
	msg := copySaveFailed
	status := http.StatusServiceUnavailable
	if out.OK || out.Conflict {
		msg, status = copyRemoveRefused, http.StatusUnprocessableEntity
	}
	echo.removeError = msg
	a.renderLine(w, r, v, commissionID, echo, status)
}

// ── Small fill helpers ──────────────────────────────────────────────────────────────────

// message shows a block with its sentence, or takes the block away.
func message(doc *page.Doc, block, text, msg string) {
	if msg == "" {
		doc.Remove(block)
		return
	}
	doc.Keep(block)
	doc.Text(text, msg)
}

func keepIf(doc *page.Doc, slot string, on bool) {
	if on {
		doc.Keep(slot)
		return
	}
	doc.Remove(slot)
}

// errorOrHint points a field at its error or its hint, and removes the other. aria-describedby
// has to name one that is actually there, or a screen reader announces nothing.
func errorOrHint(doc *page.Doc, field, errSlot, hintSlot, msg string) {
	// aria-invalid is a STRING attribute, not a boolean one: "false" is the ARIA way to say
	// a field is fine, and removing it would say the same thing less clearly.
	if msg != "" {
		doc.Text(errSlot, msg)
		doc.Attr(field, "aria-invalid", "true")
		doc.Attr(field, "aria-describedby", errSlot)
		if hintSlot != "" {
			doc.Remove(hintSlot)
		}
		return
	}
	doc.Remove(errSlot)
	doc.Attr(field, "aria-invalid", "false")
	if hintSlot != "" {
		doc.Keep(hintSlot)
		doc.Attr(field, "aria-describedby", hintSlot)
	} else {
		doc.Attr(field, "aria-describedby", "")
	}
}

// chipClass writes the status chip's colour. Written out rather than built from the kind: a
// class assembled from data is one the class-allowlist test cannot see, and an unknown
// status must stay colourless rather than borrow another's.
func chipClass(doc *page.Doc, slot, kind string) {
	switch kind {
	case "inquiry":
		doc.Class(slot, "status-inquiry", true)
	case "proposal":
		doc.Class(slot, "status-proposal", true)
	case "booked":
		doc.Class(slot, "status-booked", true)
	case "due":
		doc.Class(slot, "status-due", true)
	case "past":
		doc.Class(slot, "status-past", true)
	}
}

func absCents(c Cents) Cents {
	if c < 0 {
		return -c
	}
	return c
}

// isUUID is the id shape the accessors take. A malformed one never reaches PostgREST.
func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := 0; i < 36; i++ {
		c := s[i]
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
			if !isHex {
				return false
			}
		}
	}
	return true
}
