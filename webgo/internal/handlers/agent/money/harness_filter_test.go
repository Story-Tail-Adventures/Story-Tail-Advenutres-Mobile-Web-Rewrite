package money

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"testing"
)

// The double used to answer every lookup with the whole table, so `col=eq.value` did
// nothing and a handler that FORGOT its filter would pass. In an agent area that is a
// cross-advisor read rather than an empty page, which is why it is worth a test of its own
// rather than trusting the one line in the fake.
//
// Nothing in this sub-area went red when the filter was added, and that is the expected
// answer, not a lucky one: there is exactly one PostgREST table read here (frame.go's
// platform_user) and it is unfiltered BY DESIGN — see the comment there. Everything else
// reads through agentread, which calls Postgres functions that scope themselves.

func TestTheDoubleAppliesAnEqFilter(t *testing.T) {
	fake := newFake()
	ask := func(query string) []map[string]any {
		t.Helper()
		rec := httptest.NewRecorder()
		fake.ServeHTTP(rec, httptest.NewRequest("GET", "/rest/v1/platform_user?select=display_name,time_zone&"+query, nil))
		var rows []map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
			t.Fatalf("%v: %s", err, rec.Body.String())
		}
		return rows
	}

	if rows := ask("account_id=eq.u-gyasi"); len(rows) != 1 {
		t.Errorf("the advisor's own row came back %d times", len(rows))
	}
	// The whole point: a filter that matches nobody returns nobody.
	if rows := ask("account_id=eq.somebody-else"); len(rows) != 0 {
		t.Errorf("a filter for another account returned %d rows: %v", len(rows), rows)
	}
	// An unfiltered read still gets the row, which is what frame.go relies on.
	if rows := ask(""); len(rows) != 1 {
		t.Errorf("an unfiltered read came back with %d rows", len(rows))
	}
}

func TestMatchingLeavesWhatItDoesNotUnderstandAlone(t *testing.T) {
	rows := []map[string]any{
		{"id": "a", "agent_id": "one"},
		{"id": "b", "agent_id": "two"},
	}
	for _, c := range []struct {
		name  string
		query string
		want  int
	}{
		{"an eq on a seeded column filters", "agent_id=eq.one", 1},
		{"select, order and limit do not", "select=id&order=id.desc&limit=1", 2},
		// The rule that makes this safe to drop into an area with existing fixtures.
		{"a column the fixture does not carry does not filter", "trip_id=eq.whatever", 2},
		{"a filter that is not eq. is left alone", "agent_id=in.(one,two)", 2},
	} {
		q, err := url.ParseQuery(c.query)
		if err != nil {
			t.Fatal(err)
		}
		if got := len(matching(rows, q)); got != c.want {
			t.Errorf("%s: %q kept %d rows, want %d", c.name, c.query, got, c.want)
		}
	}
}
