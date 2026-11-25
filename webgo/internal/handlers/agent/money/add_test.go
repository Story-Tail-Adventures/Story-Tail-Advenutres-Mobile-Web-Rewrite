package money

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// §3.7.4's two steps and its one write.

var sampleTrips = []map[string]any{
	{"trip_id": sampleTripID, "title": "Kyoto in the spring", "client_display_name": "The Rodriguez family",
		"status": "in_progress", "start_date": "2027-04-03"},
	{"trip_id": "0195a2c0-1a00-7000-8000-0000000009ee", "title": "Rome, later", "client_display_name": "The Chens",
		"status": "inquiry", "start_date": nil},
}

func addWorld(t *testing.T) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_trip_roster"] = mustJSON(sampleTrips)
	// What these fixtures are FOR. Four of this area's id-bearing reads answer with rows
	// that do not echo the id they were asked for, so only the test can say.
	wd.fake.scoped["p_trip_id"] = sampleTripID
	wd.fake.rpc["agent_suppliers"] = mustJSON(sampleSuppliers)
	wd.fake.rpc["agent_trip_overview"] = mustJSON([]map[string]any{{
		"trip_id": sampleTripID, "title": "Kyoto in the spring",
		"client_display_name": "The Rodriguez family", "currency": "USD",
	}})
	wd.fake.rpc["agent_trip_components"] = mustJSON([]map[string]any{
		{"supplier_id": "0195a2c0-1a00-7000-8000-0000000009cc", "cost_cents": "400000", "commission_pct": 12},
		{"supplier_id": "0195a2c0-1a00-7000-8000-0000000009cc", "cost_cents": "248000", "commission_pct": 12},
		{"supplier_id": nil, "cost_cents": "100000", "commission_pct": 20},
	})
	return wd
}

func TestAddStepOne(t *testing.T) {
	t.Run("lists the trips a line can be filed against", func(t *testing.T) {
		wd := addWorld(t)
		rec := wd.get("/agent/commission/ledger/new")
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Which trip is it for?",
			"Kyoto in the spring", "The Rodriguez family · Apr 3, 2027 · in progress",
			// A trip with no dates still lists, with its dates simply absent.
			"Rome, later", "The Chens · inquiry",
			"?trip="+sampleTripID,
		)
		// Every live trip, whatever its stage: a cancelled trip can owe a `lost` line.
		args := wd.fake.rpcArgs["agent_trip_roster"]
		for _, status := range addTripStatuses {
			if !strings.Contains(args, `"`+status+`"`) {
				t.Errorf("the roster read left out %q: %s", status, args)
			}
		}
	})

	t.Run("the search is a GET, so the result is a URL", func(t *testing.T) {
		wd := addWorld(t)
		body := wd.get("/agent/commission/ledger/new?q=kyoto").Body.String()
		has(t, body, `value="kyoto"`)
		if !strings.Contains(wd.fake.rpcArgs["agent_trip_roster"], `"p_search":"kyoto"`) {
			t.Errorf("the search was not passed on: %s", wd.fake.rpcArgs["agent_trip_roster"])
		}
	})

	t.Run("a repeated parameter takes the first, rather than falling over", func(t *testing.T) {
		wd := addWorld(t)
		rec := wd.get("/agent/commission/ledger/new?q=a&q=b")
		if rec.Code != http.StatusOK {
			t.Errorf("status %d", rec.Code)
		}
	})

	t.Run("nothing matching says so", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.rpc["agent_trip_roster"] = "[]"
		has(t, wd.get("/agent/commission/ledger/new").Body.String(), "No trips match that.")
	})

	t.Run("a failed read is an outage", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.failing["agent_trip_roster"] = true
		if rec := wd.get("/agent/commission/ledger/new"); rec.Code != http.StatusServiceUnavailable {
			t.Errorf("status %d, want 503", rec.Code)
		}
	})
}

func TestAddStepTwo(t *testing.T) {
	t.Run("the trip is fixed and the form carries what the supplier knows", func(t *testing.T) {
		wd := addWorld(t)
		rec := wd.get("/agent/commission/ledger/new?trip=" + sampleTripID)
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body, "Kyoto in the spring", "The Rodriguez family", `value="`+sampleTripID+`"`)
		// The supplier's own usual terms, for the module to fill in.
		has(t, body, `data-rate="14"`, `data-terms="after_travel"`, `data-lag="45"`)
		// And what THIS trip's bookings with that supplier add up to: 400000 + 248000, at
		// one rate both components agree on.
		has(t, body, `data-gross="6480.00"`, `data-trip-rate="12"`)
		// A new line may only be expected or invoiced; a paid status is the payment form's.
		has(t, body, ">Expected<", ">Invoiced<")
		lacks(t, body, ">Received<", ">Disputed<")
		// Step 1 is gone, and so is its search box.
		lacks(t, body, "Which trip is it for?")
	})

	t.Run("a trip that is not this advisor's is not-found, not an outage", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.rpc["agent_trip_overview"] = "[]"
		rec := wd.get("/agent/commission/ledger/new?trip=" + sampleTripID)
		if rec.Code != http.StatusNotFound {
			t.Errorf("status %d, want 404", rec.Code)
		}
		has(t, rec.Body.String(), "That trip isn&#39;t available")
	})

	t.Run("a malformed trip id falls back to the picker without asking Postgres", func(t *testing.T) {
		wd := addWorld(t)
		rec := wd.get("/agent/commission/ledger/new?trip=nope")
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d", rec.Code)
		}
		has(t, rec.Body.String(), "Which trip is it for?")
		if _, asked := wd.fake.rpcArgs["agent_trip_overview"]; asked {
			t.Error("a malformed trip id reached PostgREST")
		}
	})

	t.Run("no suppliers on file says so rather than offering a save that will be refused", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.rpc["agent_suppliers"] = "[]"
		has(t, wd.get("/agent/commission/ledger/new?trip="+sampleTripID).Body.String(),
			"No suppliers on file yet. A line needs one to attach to.")
	})
}

func TestCreateLine(t *testing.T) {
	good := func() url.Values {
		return url.Values{
			"tripId":     {sampleTripID},
			"supplierId": {"0195a2c0-1a00-7000-8000-0000000009cc"},
			"gross":      {"6480.00"}, "rate": {"12"}, "paymentTerms": {"after_travel"},
			"paymentLagDays": {"45"}, "status": {"invoiced"},
			"inteletravelReference": {""}, "notes": {""},
		}
	}

	t.Run("creates the line and lands on it", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"commissionId":"` + sampleLineID + `"}`}
		rec := wd.post("/agent/commission/ledger/new", good())
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Location"); got != "/agent/commission/ledger/"+sampleLineID {
			t.Errorf("landed on %q", got)
		}
		body := wd.fake.calls[0].Body
		for field, want := range map[string]string{
			"op": `"create"`, "tripId": `"` + sampleTripID + `"`, "status": `"invoiced"`,
			"grossCents": "648000", "commissionPct": "12", "paymentLagDays": "45",
		} {
			if got := strings.TrimSpace(string(body[field])); got != want {
				t.Errorf("%s = %s, want %s", field, got, want)
			}
		}
		// A create carries no version: there is nothing yet to be stale against.
		if _, sent := body["expectedVersion"]; sent {
			t.Error("a create sent an expectedVersion")
		}
	})

	t.Run("a blank status is expected, never nothing", func(t *testing.T) {
		wd := addWorld(t)
		form := good()
		form.Set("status", "")
		wd.post("/agent/commission/ledger/new", form)
		if got := string(wd.fake.calls[0].Body["status"]); got != `"expected"` {
			t.Errorf("status = %s", got)
		}
	})

	t.Run("a refused field redraws the form on the same trip, with what was typed", func(t *testing.T) {
		wd := addWorld(t)
		form := good()
		form.Set("rate", "120")
		rec := wd.post("/agent/commission/ledger/new?trip="+sampleTripID, form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status %d", rec.Code)
		}
		has(t, rec.Body.String(), copyRateInvalid, `value="120"`, `value="6480.00"`, "Kyoto in the spring")
		if len(wd.fake.calls) != 0 {
			t.Error("a refused form still called the function")
		}
	})

	// An amount past what cents can hold is refused HERE rather than wrapped and sent. A JS
	// number grows and the function rejects it; an int64 wraps, and "184467440737095516.16"
	// reached the write as 0 — a $0 line, saved, with the advisor told it worked.
	t.Run("an amount that would not fit in cents never reaches the write", func(t *testing.T) {
		wd := addWorld(t)
		form := good()
		form.Set("gross", "184467440737095516.16")
		rec := wd.post("/agent/commission/ledger/new?trip="+sampleTripID, form)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("status %d, want 422", rec.Code)
		}
		if len(wd.fake.calls) != 0 {
			t.Fatalf("it called the function with %s", wd.fake.calls[0].Body["grossCents"])
		}
		has(t, rec.Body.String(), copyGrossInvalid)
	})

	t.Run("a fresh form says nothing is worked out yet, rather than $0", func(t *testing.T) {
		wd := addWorld(t)
		body := wd.get("/agent/commission/ledger/new?trip=" + sampleTripID).Body.String()
		// An em dash, as CommissionLineForm renders a null Expected.
		has(t, body, "\u2014</output>")
		lacks(t, body, "$0</output>")
	})

	t.Run("a rejection shows the function's own sentence", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.functions["POST agent-commission"] = reply{Status: 422, Body: `{"detail":"That trip is closed."}`}
		rec := wd.post("/agent/commission/ledger/new?trip="+sampleTripID, good())
		has(t, rec.Body.String(), "That trip is closed.")
	})

	t.Run("a create with no commissionId back still leaves the form", func(t *testing.T) {
		wd := addWorld(t)
		wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"ok":true}`}
		rec := wd.post("/agent/commission/ledger/new", good())
		if rec.Header().Get("Location") != "/agent/commission/ledger" {
			t.Errorf("landed on %q", rec.Header().Get("Location"))
		}
	})
}
