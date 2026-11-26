package cruisesync

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// ---- the fake database (sync_test.ts's fakeDb, grown for the scope and refetch tests) ----

// write is one captured write: which table, what kind, the payload (or rows), and the .eq()
// filters on it, so a test can tell WHICH row an update hit.
type write struct {
	table      string
	op         string // insert | update | upsert | delete
	payload    js.Ordered
	rows       []js.Ordered
	where      map[string]any
	onConflict string
}

// get is `payload[key]`, with *string flattened to its value (or nil).
func (w write) get(key string) (any, bool) {
	v, ok := field(w.payload, key)
	return flat(v), ok
}

// flat is a captured value with *string flattened to its string (or nil).
func flat(v any) any {
	if p, ok := v.(*string); ok {
		if p == nil {
			return nil
		}
		return *p
	}
	return v
}

// script is what the Deno fake could be told.
type script struct {
	// ledgerSpent is the rows already in cruise_api_request this month.
	ledgerSpent int64
	// latestQuota is the newest relay quota headers on record (nil for none).
	latestQuota *quotaRow
	// scopeError makes the scope read fail: the throw that used to strand the run row.
	scopeError string
	// scopes are the scopes the run sees.
	scopes []scopeRow
	// liveRun: another run is still `running`, started inside the overlap window.
	liveRun bool

	// Beyond the Deno fake, for the scope and refetch tests. All optional: unset, a read
	// answers "no row", as the Deno fake answered { data: null, error: null }.
	lines        map[string]string            // slug -> cruise_line id
	ships        map[string]string            // lineID + "|" + name -> cruise_ship id
	ports        map[string]string            // name -> cruise_port id
	sailingKeys  map[string]string            // provider|key|locale -> cruise_sailing id
	stored       map[string][]json.RawMessage // table -> the (id + key) rows keyPage pages
	archived     int64
	sailing      *sailingRef
	lineKey      *string
	upsertReturn bool              // upsertSailing / createShip / createPorts answer with the row's id
	failOn       map[string]string // method -> error message
}

type fakeDB struct {
	s      script
	mu     sync.Mutex
	writes []write
	audits []json.RawMessage
}

func newFakeDB(s script) *fakeDB { return &fakeDB{s: s} }

func (f *fakeDB) record(w write) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.writes = append(f.writes, w)
}

func (f *fakeDB) fail(method string) error {
	if msg, ok := f.s.failOn[method]; ok {
		return &service.Error{Message: msg}
	}
	return nil
}

func (f *fakeDB) InsertRows(_ context.Context, table string, rows any) error {
	if err := f.fail("InsertRows"); err != nil {
		return err
	}
	b, err := js.Marshal(rows)
	if err != nil {
		return err
	}
	f.mu.Lock()
	f.audits = append(f.audits, b)
	f.mu.Unlock()
	return nil
}

func (f *fakeDB) countRequestsSince(context.Context, string) (int64, error) {
	if err := f.fail("countRequestsSince"); err != nil {
		return 0, err
	}
	return f.s.ledgerSpent, nil
}

func (f *fakeDB) latestQuotaSince(context.Context, string) (*quotaRow, error) {
	return f.s.latestQuota, f.fail("latestQuotaSince")
}

func (f *fakeDB) insertRequest(_ context.Context, row js.Ordered) error {
	f.record(write{table: "cruise_api_request", op: "insert", payload: row})
	return f.fail("insertRequest")
}

func (f *fakeDB) insertRun(_ context.Context, row js.Ordered) error {
	f.record(write{table: "cruise_sync_run", op: "insert", payload: row})
	return f.fail("insertRun")
}

func (f *fakeDB) liveRun(context.Context, string, string) (bool, error) {
	return f.s.liveRun, nil
}

func (f *fakeDB) updateRun(_ context.Context, runID string, patch js.Ordered) error {
	f.record(write{table: "cruise_sync_run", op: "update", payload: patch, where: map[string]any{"id": runID}})
	return f.fail("updateRun")
}

func (f *fakeDB) readScopes(context.Context, string) ([]scopeRow, error) {
	if f.s.scopeError != "" {
		return nil, &service.Error{Message: f.s.scopeError}
	}
	return f.s.scopes, nil
}

func (f *fakeDB) updateScope(_ context.Context, scopeID string, patch js.Ordered) error {
	f.record(write{table: "cruise_sync_scope", op: "update", payload: patch, where: map[string]any{"id": scopeID}})
	return nil
}

func (f *fakeDB) upsert(_ context.Context, table string, rows []js.Ordered, onConflict string) error {
	f.record(write{table: table, op: "upsert", rows: rows, onConflict: onConflict})
	return f.fail("upsert:" + table)
}

func (f *fakeDB) keyPage(_ context.Context, table, _ string, from, to int) ([]json.RawMessage, error) {
	all := f.s.stored[table]
	if from >= len(all) {
		return nil, nil
	}
	return all[from:min(len(all), to+1)], nil
}

func (f *fakeDB) archiveMissing(_ context.Context, table, stamp string) (int64, error) {
	f.record(write{table: table, op: "update", payload: js.O("archived_at", stamp, "updated_at", stamp)})
	return f.s.archived, nil
}

func lookup(m map[string]string, k string) *string {
	if v, ok := m[k]; ok {
		return &v
	}
	return nil
}

func (f *fakeDB) lineIDBySlug(_ context.Context, slug string) (*string, error) {
	return lookup(f.s.lines, slug), nil
}

func (f *fakeDB) sailingIDByKey(_ context.Context, p, k, l string) (*string, error) {
	return lookup(f.s.sailingKeys, p+"|"+k+"|"+l), nil
}

func (f *fakeDB) idOf(row js.Ordered) *string {
	if !f.s.upsertReturn {
		return nil
	}
	v, _ := field(row, "id")
	s, _ := v.(string)
	return &s
}

func (f *fakeDB) upsertSailing(_ context.Context, row js.Ordered) (*string, error) {
	f.record(write{table: "cruise_sailing", op: "upsert", payload: row})
	return f.idOf(row), f.fail("upsertSailing")
}

func (f *fakeDB) deletePortCalls(_ context.Context, sailingID string) error {
	f.record(write{table: "cruise_port_call", op: "delete", where: map[string]any{"sailing_id": sailingID}})
	return nil
}

func (f *fakeDB) insertPortCalls(_ context.Context, rows []js.Ordered) error {
	f.record(write{table: "cruise_port_call", op: "insert", rows: rows})
	return nil
}

func (f *fakeDB) upsertCabinPrices(_ context.Context, rows []js.Ordered) error {
	f.record(write{table: "cruise_sailing_cabin_price", op: "upsert", rows: rows})
	return nil
}

func (f *fakeDB) shipID(_ context.Context, lineID, name string) (*string, error) {
	return lookup(f.s.ships, lineID+"|"+name), nil
}

func (f *fakeDB) createShip(_ context.Context, row js.Ordered) (*string, error) {
	f.record(write{table: "cruise_ship", op: "upsert", payload: row})
	return f.idOf(row), nil
}

func (f *fakeDB) portsByName(_ context.Context, names []string) ([]portRef, error) {
	var out []portRef
	for _, n := range names {
		if id, ok := f.s.ports[n]; ok {
			out = append(out, portRef{ID: id, Name: n})
		}
	}
	return out, nil
}

func (f *fakeDB) createPorts(_ context.Context, rows []js.Ordered) ([]portRef, error) {
	f.record(write{table: "cruise_port", op: "upsert", rows: rows})
	var out []portRef
	if f.s.upsertReturn {
		for _, r := range rows {
			id, _ := field(r, "id")
			name, _ := field(r, "name")
			out = append(out, portRef{ID: id.(string), Name: name.(string)})
		}
	}
	return out, nil
}

func (f *fakeDB) sailingByID(context.Context, string) (*sailingRef, error) {
	return f.s.sailing, nil
}

func (f *fakeDB) lineProviderKey(context.Context, string) (*string, error) {
	return f.s.lineKey, nil
}

func (f *fakeDB) updateSailing(_ context.Context, id string, patch js.Ordered) error {
	f.record(write{table: "cruise_sailing", op: "update", payload: patch, where: map[string]any{"id": id}})
	return nil
}

func (f *fakeDB) writesTo(table, op string) []write {
	var out []write
	for _, w := range f.writes {
		if w.table == table && w.op == op {
			out = append(out, w)
		}
	}
	return out
}

// ---- the fake relay (sync_test.ts's relay, plus a router for the scope tests) ----

type relayOpts struct {
	after      int  // good pages a throttled company gets before its 429
	monthSpent bool // the 429 says 0 remaining: the month, not the minute
}

// relay stands in for the RapidAPI relay. `/cruises` answers an empty page that says there is
// more, so a sailing scope spends exactly its max_requests_per_run. A company in `throttle`
// gets the relay's own 429 (no Retry-After) once it has had `after` good pages.
type relay struct {
	throttle []string
	opts     relayOpts
	// route, when set, answers instead (status, body, extra headers).
	route  func(u *url.URL) (int, string, http.Header)
	mu     sync.Mutex
	calls  []*url.URL
	served map[string]int
}

func newRelay(throttle []string, opts relayOpts) *relay {
	return &relay{throttle: throttle, opts: opts, served: map[string]int{}}
}

func (r *relay) client() *http.Client { return &http.Client{Transport: r} }

func (r *relay) callsFor(company string) int {
	n := 0
	for _, u := range r.calls {
		if u.Query().Get("company") == company {
			n++
		}
	}
	return n
}

func respond(status int, body string, h http.Header) *http.Response {
	if h == nil {
		h = http.Header{}
	}
	h.Set("Content-Type", "application/json")
	return &http.Response{StatusCode: status, Header: h, Body: io.NopCloser(strings.NewReader(body))}
}

func quotaHeaders(limit, remaining int) http.Header {
	return http.Header{
		"X-Ratelimit-Requests-Limit":     {strconv.Itoa(limit)},
		"X-Ratelimit-Requests-Remaining": {strconv.Itoa(remaining)},
	}
}

func (r *relay) RoundTrip(req *http.Request) (*http.Response, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u := *req.URL
	r.calls = append(r.calls, &u)
	if r.route != nil {
		status, body, h := r.route(&u)
		return respond(status, body, h), nil
	}
	company := u.Query().Get("company")
	for _, c := range r.throttle {
		if c == company && r.served[company] >= r.opts.after {
			msg := "You have exceeded the rate limit per minute for your plan, BASIC, by the API provider"
			var h http.Header
			if r.opts.monthSpent {
				msg = "You have exceeded the MONTHLY quota for Requests on your current plan, BASIC"
				h = quotaHeaders(100, 0)
			}
			b, _ := json.Marshal(map[string]string{"message": msg})
			return respond(429, string(b), h), nil
		}
	}
	r.served[company]++
	body := `{"data":[],"has_more":true,"next_cursor":"page-` + strconv.Itoa(len(r.calls)) + `"}`
	return respond(200, body, quotaHeaders(100, 80)), nil
}

// noProvider fails any test that reaches the provider when it should not have.
type noProvider struct{}

func (noProvider) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("this test must not reach the provider")
}

// testEngine is an engine over a fake database and a fake relay (no relay: any call fails).
func testEngine(db store, hc *http.Client) *engine {
	if hc == nil {
		hc = &http.Client{Transport: noProvider{}}
	}
	return &engine{
		db:      db,
		apiKey:  "test-key",
		http:    hc,
		clock:   time.Now,
		log:     discardLog,
		ceiling: DefaultMonthlyCeiling,
		env: func(k string) string {
			if k == "TRACK_CRUISES_API_KEY" {
				return "test-key"
			}
			return ""
		},
		sleep: func(context.Context, time.Duration) error { return nil },
	}
}

func i64(n int64) *int64     { return &n }
func str(s string) *string   { return &s }
func iso(t time.Time) string { return js.ISOString(t) }
