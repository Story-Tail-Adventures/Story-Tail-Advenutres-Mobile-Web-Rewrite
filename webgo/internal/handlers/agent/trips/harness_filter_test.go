package trips_test

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"
)

// The double has to apply col=eq.value, or a handler that forgot its filter passes its tests.
// Nothing in this area takes a filtered table read today, so without this test the helper
// would sit in the fake unexercised and quietly rot the next time somebody edits it. That is
// how the gap came back elsewhere.
func TestFakeAppliesEqFilter(t *testing.T) {
	rows := []map[string]any{
		{"id": "a", "account_id": "acct-1", "label": "mine"},
		{"id": "b", "account_id": "acct-2", "label": "somebody else's"},
	}

	// The filter the handler is supposed to send.
	got := matching(rows, url.Values{"account_id": {"eq.acct-1"}})
	if len(got) != 1 || got[0]["label"] != "mine" {
		t.Errorf("a filter for acct-1 returned %d rows (%v), wanted just the acct-1 row", len(got), got)
	}

	// A filter matching nothing returns nothing, not the table.
	if got := matching(rows, url.Values{"account_id": {"eq.acct-404"}}); len(got) != 0 {
		t.Errorf("a filter for another account returned %d rows, wanted 0", len(got))
	}

	// No filter at all still answers with the table: that is a correct unfiltered read, which
	// is what platform_user does (RLS scopes it, and account_id is UNIQUE).
	if got := matching(rows, url.Values{"select": {"id,label"}}); len(got) != 2 {
		t.Errorf("an unfiltered read returned %d rows, wanted both", len(got))
	}

	// A column the fixture does not carry does not filter, so this is safe beside older
	// fixtures that never modelled the column.
	if got := matching(rows, url.Values{"agent_id": {"eq.whoever"}}); len(got) != 2 {
		t.Errorf("filtering on a column the fixture lacks returned %d rows, wanted both", len(got))
	}

	// Non-eq operators are not modelled and must not silently drop rows.
	if got := matching(rows, url.Values{"account_id": {"in.(acct-1,acct-2)"}}); len(got) != 2 {
		t.Errorf("an operator the fake does not model returned %d rows, wanted both", len(got))
	}
}

// And the wiring: a seeded table is served THROUGH matching, not around it. Driven straight
// at the double, because no handler here takes a table read yet.
func TestFakeTableReadIsFiltered(t *testing.T) {
	f := newFake()
	f.tables["agent_note"] = []map[string]any{
		{"id": "n1", "trip_id": tripID, "body": "ours"},
		{"id": "n2", "trip_id": "0195a2c0-1a00-7000-8000-000000000999", "body": "another trip's"},
	}

	rec := httptest.NewRecorder()
	f.ServeHTTP(rec, httptest.NewRequest("GET", "/rest/v1/agent_note?trip_id=eq."+tripID, nil))

	var rows []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	if len(rows) != 1 || rows[0]["body"] != "ours" {
		t.Errorf("the fake served %d rows (%v), wanted only this trip's", len(rows), rows)
	}
}
