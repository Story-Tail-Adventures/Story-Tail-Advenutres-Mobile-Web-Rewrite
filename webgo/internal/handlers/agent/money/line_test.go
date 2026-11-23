package money

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// §3.7.3's view model and its three writes, against the mounted sub-area.

const sampleLineID = "0195a2c0-1a00-7000-8000-0000000009aa"
const sampleTripID = "0195a2c0-1a00-7000-8000-0000000009bb"

func lineRow(over map[string]any) map[string]any {
	row := map[string]any{
		"commission_id": sampleLineID, "trip_id": sampleTripID,
		"trip_title": "Kyoto in the spring", "trip_archived": false,
		"client_display_name": "The Rodriguez family",
		"supplier_id":         "0195a2c0-1a00-7000-8000-0000000009cc", "supplier_name": "Sandals Resorts",
		"gross_booking_cents": "648000", "commission_pct": 12.5,
		"expected_commission_cents": "81000", "processing_fee_cents": "0",
		"received_commission_cents": "0", "currency": "USD",
		"payment_terms": "after_travel", "payment_lag_days": 60,
		"expected_payment_date": "2026-10-18", "status": "expected",
		"received_at": nil, "inteletravel_reference": nil, "notes": nil,
		"version": 3, "can_remove": true, "as_of_date": "2026-11-22",
	}
	for k, v := range over {
		row[k] = v
	}
	return row
}

var sampleSuppliers = []map[string]any{
	{"supplier_id": "0195a2c0-1a00-7000-8000-0000000009cc", "name": "Sandals Resorts", "kind": "resort",
		"default_commission_pct": 14, "commission_payment_terms": "after_travel", "commission_payment_lag_days": 45},
	{"supplier_id": "0195a2c0-1a00-7000-8000-0000000009dd", "name": "Delta", "kind": "airline",
		"default_commission_pct": nil, "commission_payment_terms": nil, "commission_payment_lag_days": nil},
}

// lineWorld is a world with the detail page's two reads already answering.
func lineWorld(t *testing.T, row map[string]any) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_commission_line"] = mustJSON([]map[string]any{row})
	wd.fake.rpc["agent_suppliers"] = mustJSON(sampleSuppliers)
	return wd
}

func TestLineView(t *testing.T) {
	t.Run("an unpaid line leads with its heading and starts the payment blank", func(t *testing.T) {
		v := lineView(mustRow(t, lineRow(nil)))
		if v.Heading != "Sandals Resorts · Kyoto in the spring · $810 expected" {
			t.Errorf("heading is %q", v.Heading)
		}
		if v.TermsLine != "Sandals Resorts · paid 60 days after travel" {
			t.Errorf("terms are %q", v.TermsLine)
		}
		if v.ExpectationLine != "Expected around Oct 18, 2026." {
			t.Errorf("expectation is %q", v.ExpectationLine)
		}
		if v.PaidLine != "" {
			t.Errorf("an unpaid line says %q", v.PaidLine)
		}
		// Pre-filling expected-in-full meant Enter in any field recorded a full payment
		// nobody had checked against the statement.
		if v.PaymentValues.Received != "" || v.PaymentValues.Fee != "0.00" || v.PaymentValues.Status != "received" {
			t.Errorf("the payment form starts at %+v", v.PaymentValues)
		}
		if v.PaymentValues.ReceivedAt != "2026-11-22" {
			t.Errorf("the date starts at %q, not the advisor's today", v.PaymentValues.ReceivedAt)
		}
		// The rate is an input the advisor edits: no trailing zeros.
		if v.LineValues.Rate != "12.5" || v.LineValues.Gross != "6480.00" {
			t.Errorf("the form starts at %+v", v.LineValues)
		}
		if v.TripHref != "/agent/trips/"+sampleTripID {
			t.Errorf("the trip link is %q", v.TripHref)
		}
	})

	t.Run("a paid line says what arrived, to the cent", func(t *testing.T) {
		v := lineView(mustRow(t, lineRow(map[string]any{
			"status": "received", "received_commission_cents": "118950",
			"processing_fee_cents": "1240", "received_at": "2027-02-21",
		})))
		// In whole dollars $1,189.50 reads as $1,190 and a 40-cent fee as "a $0 fee".
		if v.PaidLine != "Received $1,189.50 on Feb 21, 2027, after a $12.40 fee." {
			t.Errorf("paid line is %q", v.PaidLine)
		}
		if v.PaymentValues.Received != "1189.50" || v.PaymentValues.Fee != "12.40" {
			t.Errorf("the payment form starts at %+v", v.PaymentValues)
		}
		if !v.IsPaid || v.StatusChip != "booked" {
			t.Errorf("status is %q / chip %q", v.Status, v.StatusChip)
		}
	})

	t.Run("no fee is not a $0 fee", func(t *testing.T) {
		v := lineView(mustRow(t, lineRow(map[string]any{
			"status": "received", "received_commission_cents": "81000", "received_at": "2027-02-21",
		})))
		if v.PaidLine != "Received $810 on Feb 21, 2027." {
			t.Errorf("paid line is %q", v.PaidLine)
		}
	})

	t.Run("no date yet says which reason", func(t *testing.T) {
		noEnd := lineView(mustRow(t, lineRow(map[string]any{"expected_payment_date": nil})))
		if noEnd.ExpectationLine != copyExpectationNoEnd {
			t.Errorf("after_travel with no date says %q", noEnd.ExpectationLine)
		}
		notBooked := lineView(mustRow(t, lineRow(map[string]any{
			"expected_payment_date": nil, "payment_terms": "at_booking", "payment_lag_days": 0,
		})))
		if notBooked.ExpectationLine != copyExpectationNotBooked {
			t.Errorf("at_booking with no date says %q", notBooked.ExpectationLine)
		}
		if notBooked.TermsLine != "Sandals Resorts · paid at booking" {
			t.Errorf("terms are %q", notBooked.TermsLine)
		}
	})

	t.Run("an archived trip has no link, and a status nobody knows stays colourless", func(t *testing.T) {
		v := lineView(mustRow(t, lineRow(map[string]any{"trip_archived": true, "status": "sideways"})))
		if v.TripHref != "" {
			t.Errorf("an archived trip linked to %q", v.TripHref)
		}
		if v.StatusChip != "unknown" || v.StatusLabel != "sideways" {
			t.Errorf("an unknown status drew %q / %q", v.StatusChip, v.StatusLabel)
		}
	})
}

func TestLinePage(t *testing.T) {
	t.Run("draws the record, the forms and the remove control", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		rec := wd.get("/agent/commission/ledger/" + sampleLineID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Sandals Resorts · Kyoto in the spring · $810 expected",
			"The Rodriguez family",
			`value="6480.00"`, `value="12.5"`, `value="60"`,
			">$810</output>", // the Expected read-out: cents show only when there are any
			`value="3"`,      // the version both forms carry
			"Sandals Resorts · paid 60 days after travel",
			"Expected around Oct 18, 2026.",
			"Remove line",
		)
		// The picker is grouped by kind, with the headings unpickable.
		has(t, body, `disabled=""`, "Resorts", "Airlines")
		// A line that may be removed does not also say it may not.
		lacks(t, body, copyRemoveNotAllowedProbe)
	})

	t.Run("a line that is on the record for good says so instead", func(t *testing.T) {
		wd := lineWorld(t, lineRow(map[string]any{"can_remove": false}))
		body := wd.get("/agent/commission/ledger/" + sampleLineID).Body.String()
		has(t, body, copyRemoveNotAllowedProbe)
		lacks(t, body, ">Remove line<")
	})

	t.Run("a bad id is a bad link, not an outage, and asks Postgres nothing", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		rec := wd.get("/agent/commission/ledger/not-a-uuid")
		if rec.Code != http.StatusNotFound {
			t.Errorf("status %d, want 404", rec.Code)
		}
		has(t, rec.Body.String(), "That line isn&#39;t on your ledger")
		if _, asked := wd.fake.rpcArgs["agent_commission_line"]; asked {
			t.Error("a malformed id reached PostgREST")
		}
	})

	t.Run("no row is not-found, whatever the reason", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_line"] = "[]"
		wd.fake.rpc["agent_suppliers"] = mustJSON(sampleSuppliers)
		rec := wd.get("/agent/commission/ledger/" + sampleLineID)
		if rec.Code != http.StatusNotFound {
			t.Errorf("status %d, want 404", rec.Code)
		}
	})

	t.Run("a failed read is an outage, not an empty line", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.failing["agent_commission_line"] = true
		rec := wd.get("/agent/commission/ledger/" + sampleLineID)
		if rec.Code != http.StatusServiceUnavailable {
			t.Errorf("status %d, want 503", rec.Code)
		}
		has(t, rec.Body.String(), "That didn’t load")
	})

	t.Run("an archived supplier is still pickable, so a notes-only save goes through", func(t *testing.T) {
		wd := newWorld(t)
		wd.fake.rpc["agent_commission_line"] = mustJSON([]map[string]any{lineRow(nil)})
		// The catalog no longer lists this line's supplier.
		wd.fake.rpc["agent_suppliers"] = mustJSON(sampleSuppliers[1:])
		body := wd.get("/agent/commission/ledger/" + sampleLineID).Body.String()
		has(t, body, copySupplierNoLongerListed, "0195a2c0-1a00-7000-8000-0000000009cc", "selected")
	})

	t.Run("an admin has no desk here", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.role = "admin"
		rec := wd.get("/agent/commission/ledger/" + sampleLineID)
		if rec.Code != http.StatusOK {
			t.Errorf("status %d", rec.Code)
		}
		has(t, rec.Body.String(), "You don’t have access to this view")
	})
}

// copyRemoveNotAllowedProbe is the sentence only the can't-remove branch writes.
const copyRemoveNotAllowedProbe = "Only a line that was never invoiced"

func TestUpdateLine(t *testing.T) {
	good := func() url.Values {
		return url.Values{
			"op": {"update"}, "commissionId": {sampleLineID}, "tripId": {sampleTripID}, "version": {"3"},
			"supplierId": {"0195a2c0-1a00-7000-8000-0000000009cc"},
			"gross":      {"6,480.00"}, "rate": {"12.5%"}, "paymentTerms": {"after_travel"},
			"paymentLagDays": {"60"}, "status": {"invoiced"},
			"inteletravelReference": {"IT-99"}, "notes": {"Checked against the statement."},
		}
	}

	t.Run("sends cents and a rate, and lands back on the line", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Location"); got != "/agent/commission/ledger/"+sampleLineID {
			t.Errorf("landed on %q", got)
		}
		if len(wd.fake.calls) != 1 {
			t.Fatalf("%d function calls", len(wd.fake.calls))
		}
		body := wd.fake.calls[0].Body
		for field, want := range map[string]string{
			"op": `"update"`, "commissionId": `"` + sampleLineID + `"`, "expectedVersion": "3",
			"status": `"invoiced"`, "grossCents": "648000", "commissionPct": "12.5",
			"paymentLagDays": "60", "clearPayment": "false",
			"inteletravelReference": `"IT-99"`,
		} {
			if got := strings.TrimSpace(string(body[field])); got != want {
				t.Errorf("%s = %s, want %s", field, got, want)
			}
		}
	})

	t.Run("a refused field keeps what was typed and says which", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		form := good()
		form.Set("gross", "lots")
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), copyGrossInvalid, `value="lots"`, `value="12.5%"`)
		if len(wd.fake.calls) != 0 {
			t.Error("a refused form still called the function")
		}
	})

	t.Run("a 409 is stale, read off conflict rather than off the sentence", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 409, Body: `{"detail":"version mismatch"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusConflict {
			t.Errorf("status %d, want 409", rec.Code)
		}
		has(t, rec.Body.String(), copyLineStale)
		lacks(t, rec.Body.String(), "version mismatch")
	})

	t.Run("a duplicate reference is a 200 that belongs against its field", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"duplicate_reference"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), copyDuplicateReference)
	})

	t.Run("a save that would wipe a payment is refused with the reason", func(t *testing.T) {
		wd := lineWorld(t, lineRow(map[string]any{"status": "received"}))
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"payment_would_clear"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		has(t, rec.Body.String(), copyClearsPayment)
	})

	t.Run("the confirmation checkbox is what sends clearPayment", func(t *testing.T) {
		wd := lineWorld(t, lineRow(map[string]any{"status": "received"}))
		form := good()
		form.Set("clearPayment", "true")
		wd.post("/agent/commission/ledger/"+sampleLineID, form)
		if got := string(wd.fake.calls[0].Body["clearPayment"]); got != "true" {
			t.Errorf("clearPayment = %s", got)
		}
	})

	t.Run("signed out mid-form goes back through sign-in to the same page", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 401, Body: `{"detail":"nope"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusSeeOther || !strings.Contains(rec.Header().Get("Location"), "/login?next=") {
			t.Errorf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
		}
	})
}

func TestRecordPayment(t *testing.T) {
	good := func() url.Values {
		return url.Values{
			"op": {"payment"}, "commissionId": {sampleLineID}, "tripId": {sampleTripID}, "version": {"3"},
			"received": {"790.00"}, "fee": {"12.00"}, "receivedAt": {"2026-11-20"}, "status": {"disputed"},
		}
	}

	t.Run("records what arrived, in cents", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		body := wd.fake.calls[0].Body
		for field, want := range map[string]string{
			"op": `"payment"`, "status": `"disputed"`, "receivedCents": "79000",
			"feeCents": "1200", "receivedAt": `"2026-11-20"`, "expectedVersion": "3",
		} {
			if got := strings.TrimSpace(string(body[field])); got != want {
				t.Errorf("%s = %s, want %s", field, got, want)
			}
		}
	})

	t.Run("anything but disputed is received: the radio cannot smuggle a status", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		form := good()
		form.Set("status", "lost")
		wd.post("/agent/commission/ledger/"+sampleLineID, form)
		if got := string(wd.fake.calls[0].Body["status"]); got != `"received"` {
			t.Errorf("status = %s", got)
		}
	})

	t.Run("a bad date from the server lands on the date field", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"bad_date"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, good())
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		has(t, rec.Body.String(), copyBadDate)
	})

	t.Run("the gap is shown for what was typed", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		form := good()
		form.Set("receivedAt", "")
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, form)
		// 81000 − 1200 − 79000 = 800 short.
		has(t, rec.Body.String(), "$8 short of expected, after the fee.")
	})
}

func TestRemoveLine(t *testing.T) {
	form := url.Values{"op": {"remove"}, "commissionId": {sampleLineID}, "tripId": {sampleTripID}, "version": {"3"}}

	t.Run("a removed line leaves the ledger", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"removed"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, form)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/commission/ledger" {
			t.Errorf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
		}
		if got := string(wd.fake.calls[0].Body["op"]); got != `"remove"` {
			t.Errorf("op = %s", got)
		}
	})

	t.Run("a refusal is said ON the line rather than closing over an unchanged one", func(t *testing.T) {
		wd := lineWorld(t, lineRow(nil))
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"not_removable"}`}
		rec := wd.post("/agent/commission/ledger/"+sampleLineID, form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		// The apostrophe renders as &#39;, so the check is on the half without one.
		has(t, rec.Body.String(), "be removed. It may have changed since you opened it.")
	})
}
