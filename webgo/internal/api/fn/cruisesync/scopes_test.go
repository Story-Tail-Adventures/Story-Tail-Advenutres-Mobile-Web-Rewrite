package cruisesync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// The per-scope paths the Deno file names as NOT covered ("reaching spent_but_stored_nothing
// needs a scope handler to run"): each scope handler, against the fake relay and the fake
// store, down to the rows it would write.

func scopeOf(endpoint string, edit ...func(*scopeRow)) scopeRow {
	s := scopeRow{ID: "scope-" + endpoint, Label: endpoint + ":test", Endpoint: endpoint, Sort: "departure_date:asc",
		MaxRowsPerRequest: 10, MaxRequestsPerRun: 1}
	for _, e := range edit {
		e(&s)
	}
	return s
}

// answer serves one JSON body for every request.
func answer(body string) func(*url.URL) (int, string, http.Header) {
	return func(*url.URL) (int, string, http.Header) { return 200, body, quotaHeaders(100, 90) }
}

func runOne(t *testing.T, s script, route func(*url.URL) (int, string, http.Header)) (*fakeDB, *relay, syncOutcome) {
	t.Helper()
	db := newFakeDB(s)
	r := newRelay(nil, relayOpts{})
	r.route = route
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	return db, r, out
}

func keysOf(o js.Ordered) string {
	var k []string
	for _, f := range o {
		k = append(k, f.Key)
	}
	return strings.Join(k, ",")
}

func rowGet(o js.Ordered, key string) any { v, _ := field(o, key); return flat(v) }

func TestCruiseLinesUpsertOnSlugReuseIDsAndArchive(t *testing.T) {
	stored, _ := json.Marshal(map[string]string{"id": "line-cel", "slug": "celebrity"})
	db, r, out := runOne(t, script{
		scopes:   []scopeRow{scopeOf("cruise_lines")},
		stored:   map[string][]json.RawMessage{"cruise_line": {stored}},
		archived: 3,
	}, answer(`{"data":[{"company":"celebrity-cruises","display_name":" Celebrity ","cruise_count":12.7,`+
		`"destinations":["Alaska","Alaska"],"earliest_departure":"2026-12-01T00:00:00-05:00"},{"company":"msc"}]}`))

	if len(r.calls) != 1 || r.calls[0].Path != "/cruise-lines" || r.calls[0].RawQuery != "" {
		t.Errorf("calls %v", r.calls)
	}
	up := db.writesTo("cruise_line", "upsert")
	if len(up) != 1 || up[0].onConflict != "slug" || len(up[0].rows) != 2 {
		t.Fatalf("upserts %+v", up)
	}
	cel, msc := up[0].rows[0], up[0].rows[1]
	if got := keysOf(cel); got != "slug,name,display_order,is_booked,sailing_count,ship_count,destination_count,"+
		"earliest_departure,latest_departure,destinations,locales,provider,provider_key,id,provider_payload,synced_at,"+
		"last_seen_at,archived_at,updated_at" {
		t.Errorf("keys %s", got)
	}
	// The stored row's id, not a new one: a re-sync must not rewrite a primary key.
	if rowGet(cel, "id") != "line-cel" || !uuid.IsV7(rowGet(msc, "id").(string)) {
		t.Errorf("ids %v %v", rowGet(cel, "id"), rowGet(msc, "id"))
	}
	if got := marshal(t, cel[:13]); got != `{"slug":"celebrity","name":"Celebrity","display_order":20,"is_booked":true,`+
		`"sailing_count":12,"ship_count":null,"destination_count":null,"earliest_departure":"2026-12-01",`+
		`"latest_departure":null,"destinations":["Alaska"],"locales":[],"provider":"track_cruises","provider_key":"celebrity-cruises"}` {
		t.Errorf("celebrity %s", got)
	}
	if rowGet(msc, "display_order") != 900 || rowGet(msc, "is_booked") != false {
		t.Errorf("msc %s", marshal(t, msc))
	}
	if len(db.writesTo("cruise_line", "update")) != 1 || out.RowsArchived != 3 || out.RowsUpserted != 2 || out.Status != "ok" {
		t.Errorf("archive/outcome %+v", out)
	}
	if v, _ := scopeUpdates(db.writes, "cruise_lines")[0].get("last_status"); v != "ok" {
		t.Errorf("last_status %v", v)
	}
}

func TestCoverageRows(t *testing.T) {
	db, r, _ := runOne(t, script{scopes: []scopeRow{scopeOf("coverage", func(s *scopeRow) { s.Company = str("ncl") })}},
		answer(`{"data":[{"company":"ncl","display_name":"   ","total_sailings":41.5,"total_snapshots":0,`+
			`"markets":[{"locale":"en_US"},{"currency":"EUR"},{"locale":"de_DE"}]}]}`))
	if r.calls[0].Path != "/coverage" || r.calls[0].RawQuery != "company=ncl" {
		t.Errorf("call %v", r.calls[0])
	}
	row := db.writesTo("cruise_line", "upsert")[0].rows[0]
	if got := keysOf(row); got != "id,slug,name,sailing_count,locales,provider,provider_key,synced_at,last_seen_at,updated_at" {
		t.Errorf("keys %s", got)
	}
	// A blank display name falls back to the slug; total_sailings is carried as sent.
	if got := marshal(t, row[1:7]); got != `{"slug":"norwegian","name":"norwegian","sailing_count":41.5,"locales":["en_US","de_DE"],`+
		`"provider":"track_cruises","provider_key":"ncl"}` {
		t.Errorf("row %s", got)
	}
}

func TestFilterOptionsPortsAndShips(t *testing.T) {
	db, r, out := runOne(t, script{
		scopes: []scopeRow{scopeOf("filter_options", func(s *scopeRow) { s.Company = str("princess") })},
		lines:  map[string]string{"princess": "line-princess"},
	}, answer(`{"data":{"ports":["'Bucht von Palma'","Bucht von Palma"," ","Juneau",7],`+
		`"ships":["Sun Princess"," "],"ship_names":["ignored, ships is not nullish"]}}`))
	if r.calls[0].Path != "/filter-options" || r.calls[0].RawQuery != "company=princess" {
		t.Errorf("call %v", r.calls[0])
	}
	ports := db.writesTo("cruise_port", "upsert")[0]
	// The two spellings of one quay are one row (the last wins), and no sailing_count key.
	if len(ports.rows) != 2 || rowGet(ports.rows[0], "name") != "Bucht von Palma" || rowGet(ports.rows[1], "name") != "Juneau" {
		t.Fatalf("ports %s", marshal(t, ports.rows))
	}
	if got := keysOf(ports.rows[0]); got != "name,provider,provider_key,id,synced_at,last_seen_at,archived_at,updated_at" {
		t.Errorf("port keys %s", got)
	}
	ships := db.writesTo("cruise_ship", "upsert")[0]
	if ships.onConflict != "cruise_line_id,name" || len(ships.rows) != 1 {
		t.Fatalf("ships %+v", ships)
	}
	if got := keysOf(ships.rows[0]); got != "name,slug,sailing_count,earliest_departure,latest_departure,provider,provider_key,"+
		"id,cruise_line_id,synced_at,last_seen_at,archived_at,updated_at" {
		t.Errorf("ship keys %s", got)
	}
	if v, has := field(ships.rows[0], "sailing_count"); !has || v != nil {
		t.Errorf("sailing_count %v: the vocabulary has no counts, so null, not 0", v)
	}
	if rowGet(ships.rows[0], "provider_key") != "princess:Sun Princess" || rowGet(ships.rows[0], "cruise_line_id") != "line-princess" {
		t.Errorf("ship %s", marshal(t, ships.rows[0]))
	}
	if out.RowsUpserted != 3 {
		t.Errorf("upserted %d", out.RowsUpserted)
	}
}

func TestFilterOptionsWithoutACompanyTakesNoShips(t *testing.T) {
	db, _, _ := runOne(t, script{scopes: []scopeRow{scopeOf("filter_options")}}, answer(`{"ships":["Sun Princess"],"ports":[]}`))
	if len(db.writesTo("cruise_ship", "upsert"))+len(db.writesTo("cruise_port", "upsert")) != 0 {
		t.Error("wrote rows")
	}
}

func TestShipsThatNameNoKnownLineAreCountedAndTheRunIsDegraded(t *testing.T) {
	db, _, out := runOne(t, script{scopes: []scopeRow{scopeOf("ships")}},
		answer(`{"data":[{"ship_name":"A","company":"msc"},{"ship_name":"B","company":"aida"},{"ship_name":"C","company":"msc"}],"has_more":false}`))
	wantNote := "ships:test: dropped 3 ship(s): no cruise_line row for msc, aida \U00002014 the reference scopes have to run first"
	if out.Status != "partial" || len(out.Notes) != 1 || out.Notes[0] != wantNote {
		t.Errorf("outcome %q %q", out.Status, out.Notes)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "spent_but_stored_nothing" {
		t.Errorf("error_code %v", v)
	}
	// A complete pass archives, even when it stored nothing (as Deno did).
	if len(db.writesTo("cruise_ship", "update")) != 1 {
		t.Error("no archive sweep after the complete pass")
	}
}

func TestAShipsPassThatIsNotCompleteDoesNotArchive(t *testing.T) {
	db, _, _ := runOne(t, script{scopes: []scopeRow{scopeOf("ships")}, lines: map[string]string{"msc": "line-msc"}},
		answer(`{"data":[{"ship_name":"MSC World Europa","company":"msc","sailing_count":12}],"has_more":true,"next_cursor":"c2"}`))
	if len(db.writesTo("cruise_ship", "update")) != 0 {
		t.Error("archived after a partial pass")
	}
	upd := scopeUpdates(db.writes, "ships")[0]
	if v, _ := upd.get("cursor"); v != "c2" {
		t.Errorf("cursor %v", v)
	}
	if v, _ := upd.get("cursor_set_at"); v != iso(base) {
		t.Errorf("cursor_set_at %v", v)
	}
	if v, _ := upd.get("last_status"); v != "partial" {
		t.Errorf("last_status %v", v)
	}
}

func TestPortsCarryTheirCountOnlyWhenTheProviderSentOne(t *testing.T) {
	db, r, _ := runOne(t, script{scopes: []scopeRow{scopeOf("ports", func(s *scopeRow) { s.Cursor = str("after-x") })}},
		answer(`{"data":[{"port":"Juneau","sailing_count":40.9},{"port":"Skagway"},{"port":"Sitka","sailing_count":null}],"has_more":false}`))
	if r.calls[0].RawQuery != "limit=10&starting_after=after-x" {
		t.Errorf("query %s", r.calls[0].RawQuery)
	}
	rows := db.writesTo("cruise_port", "upsert")[0].rows
	if got := marshal(t, []js.Ordered{rows[0][:4], rows[1][:3], rows[2][:4]}); got !=
		`[{"name":"Juneau","provider":"track_cruises","provider_key":"Juneau","sailing_count":40},`+
			`{"name":"Skagway","provider":"track_cruises","provider_key":"Skagway"},`+
			`{"name":"Sitka","provider":"track_cruises","provider_key":"Sitka","sailing_count":null}]` {
		t.Errorf("rows %s", got)
	}
	if _, has := field(rows[1], "sailing_count"); has {
		t.Error("an unmeasured port would wipe the measured count")
	}
}

func sailingJSON(id, updatedAt string) map[string]any {
	return map[string]any{
		"cruise_id": id, "company": "royal-caribbean", "locale": "en_US", "ship_name": "Icon of the Seas",
		"departure_date": "2027-02-01", "duration": 7, "price": 1500, "currency": "USD", "updated_at": updatedAt,
		"ports_list": []any{map[string]any{"port": "Miami"}},
	}
}

func TestAFreshnessScopeStopsAtTheFirstSailingItAlreadyHas(t *testing.T) {
	page, _ := json.Marshal(map[string]any{"data": []any{
		sailingJSON("S3", "2026-11-03T00:00:00Z"),
		sailingJSON("S2", "2026-11-02T00:00:00Z"),
		sailingJSON("S1", "2026-10-01T00:00:00Z"), // older than the mark: everything after is too
		sailingJSON("S0", "2026-09-01T00:00:00Z"),
	}, "has_more": true, "next_cursor": "more"})
	db, r, out := runOne(t, script{
		scopes: []scopeRow{scopeOf("cruises", func(s *scopeRow) {
			s.Sort = "updated_at:desc"
			s.MaxRequestsPerRun = 3
			s.Company = str("royal-caribbean")
			s.HighWaterUpdatedAt = str("2026-10-15T00:00:00.000Z")
		})},
		lines:        map[string]string{"royal-caribbean": "line-rc"},
		ports:        map[string]string{"Miami": "port-miami"},
		upsertReturn: true,
	}, answer(string(page)))
	if len(r.calls) != 1 {
		t.Errorf("calls %d: reaching a known sailing completes the pass", len(r.calls))
	}
	if u := r.calls[0].Query(); u.Get("sort") != "updated_at:desc" || u.Get("departure_after") != "2026-09-28" || u.Get("departure_before") != "" {
		t.Errorf("query %s", r.calls[0].RawQuery)
	}
	if n := len(db.writesTo("cruise_sailing", "upsert")); n != 2 || out.RowsUpserted != 2 {
		t.Errorf("sailings %d upserted %d", n, out.RowsUpserted)
	}
	upd := scopeUpdates(db.writes, "cruises")[0]
	if v, _ := upd.get("high_water_updated_at"); v != "2026-11-03T00:00:00.000Z" {
		t.Errorf("high water %v", v)
	}
	if v, has := upd.get("cursor"); !has || v != nil {
		t.Errorf("cursor %v", v)
	}
	if v, _ := upd.get("last_status"); v != "ok" {
		t.Errorf("last_status %v", v)
	}
	s := db.writesTo("cruise_sailing", "upsert")[0].payload
	if got := keysOf(s); got != "provider,provider_key,provider_locale,title,departure_date,duration_nights,lead_price_cents,"+
		"currency,lead_price_eur_cents,destinations,itinerary_url,provider_updated_at,id,cruise_line_id,ship_id,"+
		"provider_payload,synced_at,last_seen_at,archived_at,updated_at" {
		t.Errorf("sailing keys %s", got)
	}
	if got := marshal(t, rowGet(s, "lead_price_cents")); got != "150000" {
		t.Errorf("cents %s", got)
	}
	calls := db.writesTo("cruise_port_call", "insert")[0].rows[0]
	if got := marshal(t, calls); !strings.HasPrefix(got, `{"port_name":"Miami","sequence":1,"day":null,"arrival_at":null,"departure_at":null,"id":"`) ||
		rowGet(calls, "port_id") != "port-miami" {
		t.Errorf("port call %s", got)
	}
}

func TestACoverageScopeKeepsWalkingPastOldSailings(t *testing.T) {
	// Under departure_date:asc an older updated_at says nothing about what follows.
	page, _ := json.Marshal(map[string]any{"data": []any{sailingJSON("S1", "2020-01-01T00:00:00Z"), sailingJSON("S2", "2020-01-02T00:00:00Z")},
		"has_more": true, "next_cursor": "next"})
	db, _, _ := runOne(t, script{
		scopes: []scopeRow{scopeOf("cruises", func(s *scopeRow) {
			s.HighWaterUpdatedAt = str("2026-10-15T00:00:00.000Z")
		})},
		lines:        map[string]string{"royal-caribbean": "line-rc"},
		upsertReturn: true,
	}, answer(string(page)))
	if n := len(db.writesTo("cruise_sailing", "upsert")); n != 2 {
		t.Errorf("sailings %d", n)
	}
	if v, _ := scopeUpdates(db.writes, "cruises")[0].get("cursor"); v != "next" {
		t.Errorf("cursor %v", v)
	}
}

func TestEveryWayASailingCanVanishIsCounted(t *testing.T) {
	page, _ := json.Marshal(map[string]any{"data": []any{
		map[string]any{"cruise_id": "X", "company": "royal-caribbean", "locale": "en_US"},      // no date: unmappable
		func() map[string]any { s := sailingJSON("Y", ""); s["company"] = "aida"; return s }(), // no line
		sailingJSON("Z", ""), // the upsert returns no id (the fake's default)
	}, "has_more": false})
	db, _, out := runOne(t, script{scopes: []scopeRow{scopeOf("cruises")}, lines: map[string]string{"royal-caribbean": "line-rc"}},
		answer(string(page)))
	want := "cruises:test: dropped 1 sailing(s): no cruise_line row for aida \U00002014 the reference scopes have to run first; " +
		"dropped 1 sailing(s): the provider payload did not map \U00002014 a renamed or missing field is the usual cause; " +
		"dropped 1 sailing(s): the upsert returned no id"
	if out.Status != "partial" || len(out.Notes) != 1 || out.Notes[0] != want {
		t.Errorf("outcome %q %q", out.Status, out.Notes)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "spent_but_stored_nothing" {
		t.Errorf("error_code %v", v)
	}
}

func TestAScopeWithNoHandlerFailsAloneAndTheRunGoesOn(t *testing.T) {
	db, r, out := runOne(t, script{scopes: []scopeRow{scopeOf("cruise_detail"), scopeOf("ports")}},
		answer(`{"data":[],"has_more":false}`))
	if len(r.calls) != 1 || out.Status != "partial" || out.Notes[0] != "cruise_detail:test: scope cruise_detail:test has no sync handler" {
		t.Errorf("calls %d outcome %q %q", len(r.calls), out.Status, out.Notes)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "scope_failed" {
		t.Errorf("error_code %v", v)
	}
	if v, _ := scopeUpdates(db.writes, "cruise_detail")[0].get("last_error"); v != "scope cruise_detail:test has no sync handler" {
		t.Errorf("last_error %v", v)
	}
}

func TestATierGateNamesTheTierItNeeds(t *testing.T) {
	_, _, out := runOne(t, script{scopes: []scopeRow{scopeOf("ports")}}, func(*url.URL) (int, string, http.Header) {
		return 403, `{"code":"tier_insufficient","detail":"Ports need PRO.","required_tier":"PRO"}`, nil
	})
	if out.Notes[0] != "ports:test: tier_insufficient (needs PRO): Ports need PRO." || out.Status != "failed" {
		t.Errorf("outcome %q %q", out.Status, out.Notes)
	}
}

func TestTheBudgetIsCheckedBeforeEveryScope(t *testing.T) {
	// 89 spent: one request left under the ceiling. The first scope spends it.
	db, r, out := runOne(t, script{ledgerSpent: 89, scopes: []scopeRow{scopeOf("ports"), scopeOf("coverage")}},
		answer(`{"data":[],"has_more":false}`))
	if len(r.calls) != 1 || !hasNotePrefix(out.Notes, "stopped before coverage:test: monthly ceiling reached (90/90 this month)") {
		t.Errorf("calls %d notes %q", len(r.calls), out.Notes)
	}
	if len(scopeUpdates(db.writes, "coverage")) != 0 {
		t.Error("the unreached scope was written")
	}
}

func TestDedupeKeepsTheLastAtTheFirstPosition(t *testing.T) {
	rows := []js.Ordered{
		js.O("name", "A", "n", 1), js.O("name", "B", "n", 2), js.O("name", "A", "n", 3), js.O("name", nil, "n", 4), js.O("name", "null", "n", 5),
	}
	got := marshal(t, dedupeByConflictKey(rows, "name"))
	if got != `[{"name":"A","n":3},{"name":"B","n":2},{"name":null,"n":4},{"name":"null","n":5}]` {
		t.Errorf("dedupe %s", got)
	}
	two := []js.Ordered{js.O("cruise_line_id", "L", "name", "X|Y"), js.O("cruise_line_id", "L|X", "name", "Y")}
	if len(dedupeByConflictKey(two, "cruise_line_id, name")) != 2 {
		t.Error("a separator inside a value collided")
	}
}

func TestTheIDLookupPagesTheWholeTable(t *testing.T) {
	var stored []json.RawMessage
	for i := 0; i < 1500; i++ {
		b, _ := json.Marshal(map[string]string{"id": "port-" + js.NumberString(float64(i)), "name": "P" + js.NumberString(float64(i))})
		stored = append(stored, b)
	}
	db := newFakeDB(script{stored: map[string][]json.RawMessage{"cruise_port": stored}})
	out, err := testEngine(db, nil).withExistingIDs(context.Background(), "cruise_port",
		[]js.Ordered{js.O("name", "P1499", "id", "new"), js.O("name", "Q", "id", "new")}, "name")
	if err != nil {
		t.Fatal(err)
	}
	if rowGet(out[0], "id") != "port-1499" || rowGet(out[1], "id") != "new" {
		t.Errorf("ids %s", marshal(t, out))
	}
}

func TestTheDepartureWindow(t *testing.T) {
	cases := []struct {
		days int64
		want string
		err  bool
	}{
		{0, "2026-09-28", false},
		{90, "2026-12-27", false},
		{548, "2028-03-29", false},
		{3_000_000, "+010240-06", false},
		{100_000_001, "", true},
	}
	for _, c := range cases {
		got, err := isoDateAfter(base, c.days)
		if (err != nil) != c.err || got != c.want {
			t.Errorf("%d: %q %v", c.days, got, err)
		}
	}
	if _, err := isoDateAfter(base, 100_000_001); err == nil || err.Error() != "Invalid time value" {
		t.Errorf("RangeError text: %v", err)
	}
}

func TestDueToRun(t *testing.T) {
	last := func(s string) func(*scopeRow) { return func(r *scopeRow) { r.LastRunAt = &s; r.MinIntervalDays = 6 } }
	cases := []struct {
		s    scopeRow
		want bool
	}{
		{scopeOf("ports"), true}, // interval 0
		{scopeOf("ports", func(r *scopeRow) { r.MinIntervalDays = 6 }), true},                        // never ran
		{scopeOf("ports", last("2026-09-22T09:17:00+00:00")), true},                                  // exactly 6 days
		{scopeOf("ports", last("2026-09-22T09:17:00.000001+00:00")), true},                           // microseconds: ms precision, as Date.parse
		{scopeOf("ports", last("2026-09-22T09:17:00.001+00:00")), false},                             // a millisecond short
		{scopeOf("ports", last("not a date")), true},                                                 // NaN
		{scopeOf("ports", last("2026-09-28T09:14:00+00:00")), false},                                 // this Monday's earlier tick
		{scopeOf("ports", func(r *scopeRow) { r.MinIntervalDays = 6; r.LastRunAt = str("") }), true}, // "" is falsy
	}
	for i, c := range cases {
		if got := dueToRun(c.s, base); got != c.want {
			t.Errorf("%d: %v", i, got)
		}
	}
}
