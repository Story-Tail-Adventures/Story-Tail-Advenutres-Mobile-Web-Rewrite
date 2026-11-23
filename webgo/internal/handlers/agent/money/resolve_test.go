package money

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// §3.7.6's Resolve page and its one write.

const sampleCandID = "0195a2c0-1a00-7000-8000-00000000dd01"

func resolveWorld(t *testing.T, st map[string]any, line map[string]any, cands []map[string]any) *world {
	t.Helper()
	wd := newWorld(t)
	wd.fake.rpc["agent_commission_import"] = mustJSON([]map[string]any{st})
	wd.fake.rpc["agent_commission_import_rows"] = mustJSON([]map[string]any{line})
	wd.fake.rpc["agent_commission_import_candidates"] = mustJSON(cands)
	wd.fake.rpc["agent_suppliers"] = mustJSON(sampleSuppliers)
	wd.fake.rpc["agent_trip_roster"] = mustJSON(sampleTrips)
	wd.fake.rpc["agent_trip_overview"] = mustJSON([]map[string]any{{
		"trip_id": sampleTripID, "title": "Kyoto in the spring",
		"client_display_name": "The Rodriguez family", "currency": "USD",
	}})
	return wd
}

func resolveURL() string {
	return "/agent/commission/import/" + sampleImportID + "/rows/" + sampleRowID
}

func TestResolvePage(t *testing.T) {
	cands := []map[string]any{{
		"commission_id": sampleCandID, "trip_title": "Anniversary Week in Negril",
		"client_name": "Jordan Hayes", "supplier_name": "Sandals Resorts",
		"start_date": "2027-02-03", "expected_cents": "136800",
	}}

	t.Run("draws the row, the suggestion, the candidates and the trip search", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), cands)
		rec := wd.get(resolveURL())
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, wd.logs.String())
		}
		body := rec.Body.String()
		has(t, body,
			"Resolve a statement row · Row 1",
			"SRB-220119 · Sandals Resorts · M Hayes",
			"$1,368.00 · Feb 21, 2027",
			// The suggestion is labelled as ITSELF, not with the row's match label.
			"Sandals Resorts · Jordan Hayes · Anniversary Week in Negril",
			"Anniversary Week in Negril", "expected $1,368.00", "Feb 3, 2027",
			"Set aside", "Create a new line", "Find a trip",
		)
		// Every decision posts to this row's own URL, so no form carries the two ids.
		lacks(t, body, `name="importId"`, `name="rowId"`)
	})

	t.Run("no candidates says to create one instead", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
		has(t, wd.get(resolveURL()).Body.String(), "No unpaid lines to match.")
	})

	t.Run("a row already settled goes back to the statement, not a dead form", func(t *testing.T) {
		for _, state := range []string{"already_recorded", "confirmed"} {
			wd := resolveWorld(t, importRow(nil), importLineRow(map[string]any{"state": state}), cands)
			rec := wd.get(resolveURL())
			if state == "already_recorded" {
				if rec.Code != http.StatusSeeOther {
					t.Errorf("%s: status %d, want 303", state, rec.Code)
				}
				continue
			}
			// A confirmed row can still be changed, but it is not offered its own
			// suggestion back.
			lacks(t, rec.Body.String(), "Use this match")
		}
	})

	t.Run("a statement no longer in review has nothing to resolve", func(t *testing.T) {
		wd := resolveWorld(t, importRow(map[string]any{"status": "reconciled"}), importLineRow(nil), cands)
		rec := wd.get(resolveURL())
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != statementPath(sampleImportID) {
			t.Errorf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
		}
	})

	t.Run("an unreadable row is offered no money decision at all", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(map[string]any{
			"state": "unreadable", "match_basis": "none", "line_id": nil,
			"parse_error": "Amount column is empty",
		}), cands)
		body := wd.get(resolveURL()).Body.String()
		has(t, body, "Amount column is empty", "Set aside")
		lacks(t, body, "Create a new line", "Find a trip")
	})

	t.Run("a chosen trip opens the create form, pre-filled from the row", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(map[string]any{
			"state": "unmatched", "match_basis": "none", "line_id": nil,
			"gross_cents": "1140000", "received_cents": "136800", "fee_cents": "0",
		}), nil)
		body := wd.get(resolveURL() + "?trip=" + sampleTripID).Body.String()
		has(t, body,
			"Kyoto in the spring · The Rodriguez family",
			`value="11400.00"`, // the row's own gross
			"Create line when reconciled", "Choose a different trip",
		)
		// Sandals is named in the statement text and has a default of 14%.
		has(t, body, `value="14"`)
		lacks(t, body, "Find a trip")
	})

	t.Run("a trip that does not resolve falls back to the search and says why", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
		wd.fake.rpc["agent_trip_overview"] = "[]"
		body := wd.get(resolveURL() + "?trip=" + sampleTripID).Body.String()
		has(t, body, "Find a trip", "available. Find another below.")
	})

	t.Run("a bad id is a bad link and asks Postgres nothing", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), cands)
		rec := wd.get("/agent/commission/import/" + sampleImportID + "/rows/nope")
		if rec.Code != http.StatusNotFound {
			t.Errorf("status %d, want 404", rec.Code)
		}
		if _, asked := wd.fake.rpcArgs["agent_commission_import_rows"]; asked {
			t.Error("a malformed row id reached PostgREST")
		}
	})
}

func TestGuessSupplier(t *testing.T) {
	groups := groupSuppliers([]supplierCatalogRow{
		{SupplierID: "royal", Name: "Royal Caribbean", Kind: "cruise_line"},
		{SupplierID: "roy", Name: "Royal", Kind: "cruise_line"},
		{SupplierID: "sandals", Name: "Sandals Resorts", Kind: "resort"},
		{SupplierID: "delta", Name: "Delta", Kind: "airline"},
	})
	// The LONGEST match wins: "Royal Caribbean" over a "Royal" that also matches.
	if got := guessSupplier(groups, "ROYAL CARIBBEAN INTL"); got != "royal" {
		t.Errorf("guessed %q", got)
	}
	// Accents and punctuation are folded away.
	if got := guessSupplier(groups, "Sandals Resorts®"); got != "sandals" {
		t.Errorf("guessed %q", got)
	}
	// Nothing to go on is no guess, rather than a wrong one on somebody's money.
	for _, text := range []string{"", "ab", "Nobody At All"} {
		if got := guessSupplier(groups, text); got != "" {
			t.Errorf("guessSupplier(%q) = %q", text, got)
		}
	}
	// Two of the same length is a coin toss, so it declines.
	tie := groupSuppliers([]supplierCatalogRow{
		{SupplierID: "a", Name: "Aaaa", Kind: "other"},
		{SupplierID: "b", Name: "Bbbb", Kind: "other"},
	})
	if got := guessSupplier(tie, "aaaa bbbb"); got != "" {
		t.Errorf("a tie guessed %q", got)
	}
}

func TestResolveRow(t *testing.T) {
	base := func(action string) url.Values {
		return url.Values{"action": {action}, "version": {"4"}}
	}

	t.Run("confirm sends the row and the version it was shown with", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"resolved"}`}
		rec := wd.post(resolveURL(), base("confirm"))
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != statementPath(sampleImportID) {
			t.Fatalf("status %d, location %q", rec.Code, rec.Header().Get("Location"))
		}
		body := wd.fake.calls[0].Body
		for field, want := range map[string]string{
			"op": `"resolve"`, "action": `"confirm"`,
			"importId": `"` + sampleImportID + `"`, "rowId": `"` + sampleRowID + `"`,
			"expectedVersion": "4",
		} {
			if got := strings.TrimSpace(string(body[field])); got != want {
				t.Errorf("%s = %s, want %s", field, got, want)
			}
		}
	})

	t.Run("match needs a line, and create needs a trip and figures", func(t *testing.T) {
		for _, c := range []struct {
			form url.Values
			want string
		}{
			{base("match"), "take this payment anymore"},
			{base("create"), copyCreateNeedsTrip},
			{url.Values{"action": {"create"}, "version": {"4"}, "tripId": {sampleTripID}}, copyCreateNeedsGross},
			{url.Values{"action": {"create"}, "version": {"4"}, "tripId": {sampleTripID}, "gross": {"6480.00"}}, copyCreateNeedsRate},
		} {
			wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
			rec := wd.post(resolveURL(), c.form)
			if rec.Code != http.StatusUnprocessableEntity {
				t.Errorf("status %d for %v", rec.Code, c.form)
			}
			has(t, rec.Body.String(), c.want)
			if len(wd.fake.calls) != 0 {
				t.Errorf("%v still called the function", c.form)
			}
		}
	})

	t.Run("create sends cents and a rate", func(t *testing.T) {
		wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"resolved"}`}
		form := url.Values{
			"action": {"create"}, "version": {"4"}, "tripId": {sampleTripID},
			"supplierId": {"0195a2c0-1a00-7000-8000-0000000009cc"},
			"gross":      {"6,480.00"}, "rate": {"12.5%"},
		}
		wd.post(resolveURL(), form)
		body := wd.fake.calls[0].Body
		if got := strings.TrimSpace(string(body["grossCents"])); got != "648000" {
			t.Errorf("grossCents = %s", got)
		}
		if got := strings.TrimSpace(string(body["commissionPct"])); got != "12.5" {
			t.Errorf("commissionPct = %s", got)
		}
	})

	t.Run("each refusal gets its own sentence", func(t *testing.T) {
		// The sentences carry apostrophes, which render as &#39;, so each is checked on
		// the half that has none.
		for outcome, want := range map[string]string{
			"line_unavailable":   "take this payment anymore",
			"trip_not_found":     "available anymore. Pick another.",
			"supplier_not_found": "supplier isn&#39;t available anymore",
			"not_allowed":        "available for this row.",
		} {
			wd := resolveWorld(t, importRow(nil), importLineRow(nil), nil)
			wd.fake.functions["POST commission-import"] = reply{Status: 200, Body: `{"outcome":"` + outcome + `"}`}
			rec := wd.post(resolveURL(), base("confirm"))
			if rec.Code != http.StatusUnprocessableEntity {
				t.Errorf("%s: status %d", outcome, rec.Code)
			}
			has(t, rec.Body.String(), want)
		}
	})

	t.Run("a 409 is stale and keeps the version the page carried", func(t *testing.T) {
		wd := resolveWorld(t, importRow(map[string]any{"version": 9}), importLineRow(nil), nil)
		wd.fake.functions["POST commission-import"] = reply{Status: 409, Body: `{"detail":"nope"}`}
		rec := wd.post(resolveURL(), base("confirm"))
		body := rec.Body.String()
		has(t, body, copyStatementStale)
		if strings.Contains(body, `value="9"`) {
			t.Error("the refused page handed back the server's version")
		}
		has(t, body, `value="4"`)
	})
}
