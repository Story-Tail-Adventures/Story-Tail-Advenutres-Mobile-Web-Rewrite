package money

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
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

// The double used to answer an RPC by NAME alone, ignoring the body, so a read that lost or
// mistook its p_commission_id or p_import_id was handed the fixture and passed. Recording
// the body in rpcArgs is not scoping: it only helps the tests that remember to assert on it,
// and this sub-area asserted on an id in exactly one place while carrying more id parameters
// than any other area.
//
// Measured, by pointing a read at a different id: with scoping off, one test caught it; with
// it on, 19 (p_commission_id) and 26 (p_import_id).
func TestTheDoubleScopesAnRPCByTheIdsInTheCall(t *testing.T) {
	const fixture = `[{"commission_id":"line-1","trip_id":"trip-1","status":"received"}]`
	for _, c := range []struct {
		name string
		args string
		want bool
	}{
		{"the id it is for is answered", `{"p_commission_id":"line-1"}`, false},
		{"another advisor's id is not", `{"p_commission_id":"line-2"}`, true},
		{"a second id has to agree too", `{"p_commission_id":"line-1","p_trip_id":"trip-2"}`, true},
		// A null argument is an absent filter, not a filter for null: these functions read
		// `p_supplier_id IS NULL OR supplier_id = p_supplier_id`.
		{"a null argument does not scope", `{"p_status":null}`, false},
		// An array is a membership test and a number is a page size; neither is equality.
		{"an array argument does not scope", `{"p_status":["booked","received"]}`, false},
		{"a number does not scope", `{"p_limit":25,"p_offset":0}`, false},
		// The rule that makes this safe to add to fixtures written before it.
		{"a field the fixture does not carry does not scope", `{"p_import_id":"anything"}`, false},
	} {
		if got := scopedOut(fixture, []byte(c.args)); got != c.want {
			t.Errorf("%s: scopedOut(%s) = %v, want %v", c.name, c.args, got, c.want)
		}
	}

	// And an answer with no rows cannot be scoped out of existence.
	if scopedOut(`[]`, []byte(`{"p_commission_id":"line-2"}`)) {
		t.Error("an empty answer was scoped out")
	}
}

// scopedOut can only compare a read's id against an answer that CARRIES that id, and four of
// this area's nine id-bearing reads answer with rows that do not: agent_commission_import_rows
// (p_import_id), agent_commission_import_candidates (p_row_id) and agent_trip_components
// (p_trip_id). Each world declares what its fixtures are for instead.
//
// Measured per read, by pointing each one at a made-up id — tests turned red:
//
//	                                              derived only   + declared
//	add.go           agent_trip_overview               8             8
//	add.go           agent_trip_components             0             2
//	line.go          agent_commission_line            19            19
//	resolve.go       agent_commission_import          16            16
//	resolve.go       agent_commission_import_rows      0            16
//	resolve.go       agent_commission_import_cands     0             3
//	resolve.go       agent_trip_overview               5             5
//	statement.go     agent_commission_import          26            26
//	statement.go     agent_commission_import_rows      0             3
func TestTheDeclaredScopeCoversWhatTheFixtureCannot(t *testing.T) {
	fake := newFake()
	fake.scoped["p_import_id"] = "import-1"

	// The rows carry no import_id, so only the declaration can scope this.
	const rowsWithNoImportID = `[{"import_row_id":"r1","reference":"ITV-1"}]`
	if scopedOut(rowsWithNoImportID, []byte(`{"p_import_id":"import-2"}`)) {
		t.Error("scopedOut claimed to scope a fixture that does not carry the id")
	}
	if fake.inScope([]byte(`{"p_import_id":"import-2"}`)) {
		t.Error("another statement's rows were answered")
	}
	if !fake.inScope([]byte(`{"p_import_id":"import-1"}`)) {
		t.Error("the statement these fixtures are for was not answered")
	}

	for _, c := range []struct {
		name string
		args string
		want bool
	}{
		{"an undeclared parameter does not scope", `{"p_trip_id":"anything"}`, true},
		{"a null argument is an absent filter", `{"p_import_id":null}`, true},
		{"an array is a membership test, not an id", `{"p_import_id":["a","b"]}`, true},
		{"a number is a page size", `{"p_import_id":25}`, true},
		{"an unreadable body is not a reason to answer empty", `not json`, true},
	} {
		if got := fake.inScope([]byte(c.args)); got != c.want {
			t.Errorf("%s: inScope(%s) = %v, want %v", c.name, c.args, got, c.want)
		}
	}

	// A world that declares nothing behaves exactly as before.
	if !newFake().inScope([]byte(`{"p_import_id":"anything"}`)) {
		t.Error("a world with no declared scope refused a read")
	}
}

// A search term is not an id, and the id guards above cannot cover it: a term that arrives
// WRONG is caught by a declared scope, but a term DROPPED arrives as null, which these
// functions read as "no filter" and the guards correctly let through. searched is what makes
// the rows depend on the term, so both mistakes change the page.
func TestTheFakeNarrowsAReplyByItsSearchTerm(t *testing.T) {
	roster := `[{"title":"Kyoto in the spring","client_display_name":"The Rodriguez family"},` +
		`{"title":"Rome, later","client_display_name":"The Chens"}]`

	for _, c := range []struct {
		name  string
		args  string
		reply string
		want  []string
		gone  []string
	}{
		{"a term keeps only what it matches", `{"p_search":"kyoto"}`, roster,
			[]string{"Kyoto in the spring"}, []string{"Rome, later"}},
		{"it matches the client's name too", `{"p_search":"Chens"}`, roster,
			[]string{"Rome, later"}, []string{"Kyoto in the spring"}},
		{"case does not matter, as ILIKE does not", `{"p_search":"ROME"}`, roster,
			[]string{"Rome, later"}, []string{"Kyoto in the spring"}},
		{"no term is no filter", `{"p_search":null}`, roster,
			[]string{"Kyoto in the spring", "Rome, later"}, nil},
		{"a blank term is no filter, as btrim makes it", `{"p_search":"  "}`, roster,
			[]string{"Kyoto in the spring", "Rome, later"}, nil},
		{"an absent parameter is no filter", `{"p_limit":25}`, roster,
			[]string{"Kyoto in the spring", "Rome, later"}, nil},
		{"rows with none of the searched columns are left alone", `{"p_search":"kyoto"}`,
			`[{"commission_id":"c-1","amount_cents":"1000"}]`, []string{"c-1"}, nil},
		{"a term matching nothing empties the answer", `{"p_search":"zzz"}`, roster,
			nil, []string{"Kyoto in the spring", "Rome, later"}},
		{"an unreadable body narrows nothing", `not json`, roster,
			[]string{"Kyoto in the spring", "Rome, later"}, nil},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := searched(c.reply, []byte(c.args))
			for _, want := range c.want {
				if !strings.Contains(got, want) {
					t.Errorf("%q was narrowed away: %s", want, got)
				}
			}
			for _, gone := range c.gone {
				if strings.Contains(got, gone) {
					t.Errorf("%q survived the search: %s", gone, got)
				}
			}
		})
	}
}
