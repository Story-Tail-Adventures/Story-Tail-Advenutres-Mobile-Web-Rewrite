//go:build difftest && difftest_background

package difftest

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/cruisesync"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["cruise-sync"] = api.Port{Gate: api.GateCron, Fn: cruisesync.Func}
}

// cruise-sync is a pg_cron function: Deno takes the service-role key as its bearer, Go the
// cron secret (GateCron). The provider is metered (about 100 requests a month) and is NEVER
// called: TRACK_CRUISES_API_KEY is unset on both sides, and the Deno side's base URL is a
// constant that cannot be pointed at a fake. So the differential cases are the paths reachable
// without the provider: the wrong method, the body validation, and the unset key. Every case
// also proves that nothing was written: no run row, no ledger row, no audit row.
//
// The whole run against the provider is covered on the Go side only: the 16 ported Deno tests
// and the scope tests in internal/api/fn/cruisesync (fakes), and TestCruiseSyncGoAgainstTheStack
// below, which runs the Go engine against this stack's real tables with a fake provider.

// cruiseSyncSnap is every row a run or a refetch would leave, minted since the case began.
func cruiseSyncSnap(t *testing.T, w *World) string {
	since := w.Vars["since"]
	runs := S.Rows(t, S.DB.From("cruise_sync_run").
		Select("trigger,status,scopes_run,requests_spent,rows_upserted,rows_archived,quota_limit,quota_remaining,error_code,error_detail").
		Gte("id", since).Order("id", true))
	ledger := S.Rows(t, S.DB.From("cruise_api_request").
		Select("run_id,endpoint,path,query,status_code,error_code").Gte("id", since).Order("id", true))
	audit := S.Rows(t, S.DB.From("audit_event").
		Select("actor_user_id,actor_role,event_type,target_entity,target_id,metadata").
		In("event_type", []string{"cruise.synced", "cruise_sailing.refetched"}).Gte("id", since).Order("id", true))
	return "runs " + runs + " ledger " + ledger + " audit " + audit
}

func TestCruiseSync(t *testing.T) {
	world := func(name string) *World {
		return &World{Name: name, Agent: &Actor{}, Traveler: &Actor{}, Vars: map[string]string{}}
	}
	deno, goW := world("deno"), world("go")
	// The service-role key to Deno (requireServiceRole), the cron secret to Go (GateCron).
	cron := func(w *World) string {
		if w.Name == "deno" {
			return S.Service
		}
		return CronSecret
	}
	sailing := uuid.New()
	c := func(name, method, body string, expect int) Case {
		return Case{
			Name: name, Fn: "cruise-sync", Method: method, Token: cron, SkipAudit: true, Expect: expect,
			Setup: func(_ *testing.T, w *World) { w.Vars["since"] = Since(time.Now()) },
			Body:  func(*World) string { return body },
			Snap:  cruiseSyncSnap,
		}
	}
	Run(t, deno, goW, []Case{
		// The method comes first: a GET is refused whatever it carries.
		c("GET is refused", "GET", "", 403),
		c("GET with a bad sailingId is still the method's refusal", "GET", `{"sailingId":"nope"}`, 403),

		// Every well-formed body reaches the key check, which refuses: the key is unset.
		c("the cron tick's own body", "POST", `{"trigger":"cron"}`, 403),
		c("no body at all", "POST", "", 403),
		c("a body that is not JSON", "POST", `{"trigger":`, 403),
		c("null", "POST", `null`, 403),
		c("an array", "POST", `[1,2]`, 403),
		c("a string", "POST", `"manual"`, 403),
		c("a manual run narrowed to one scope", "POST", `{"trigger":"manual","scope":"  sailings:rc:caribbean  "}`, 403),
		c("a scope that is not a string", "POST", `{"trigger":"manual","scope":42}`, 403),
		c("a refetch of a sailing", "POST", `{"sailingId":"`+sailing+`"}`, 403),
		c("a refetch with an upper-case id", "POST", `{"sailingId":"`+strings.ToUpper(sailing)+`"}`, 403),

		// The sailing id is checked BEFORE the key, so these are 400s even with no key.
		c("sailingId not a uuid", "POST", `{"sailingId":"not-a-uuid"}`, 400),
		c("sailingId null", "POST", `{"sailingId":null}`, 400),
		c("sailingId a number", "POST", `{"sailingId":12}`, 400),
		c("sailingId empty", "POST", `{"sailingId":""}`, 400),
		c("sailingId with spaces", "POST", `{"sailingId":" `+sailing+` "}`, 400),
	})
}

// TestCruiseSyncGate pins the one place the two sides cannot agree word for word: the gate.
// Deno read the token's role claim (requireServiceRole) behind the gateway's verify_jwt; Go
// checks STA_CRON_SECRET in the registry (ruling 13) before the function runs. The statuses
// agree; the sentences are the registry's. Go never accepts the service-role key here.
func TestCruiseSyncGate(t *testing.T) {
	body := `{"trigger":"cron"}`
	cases := []struct {
		name           string
		deno, goHeader http.Header
		status         int
		goDetail       string
	}{
		{"no token", http.Header{}, http.Header{}, 401, "Missing bearer token."},
		{"the anon key", Bearer(S.Anon), Bearer(S.Anon), 403, "This function runs on the schedule, not for a caller."},
		{"each side's own credential, swapped", Bearer(CronSecret), Bearer(S.Service), 0, "This function runs on the schedule, not for a caller."},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := S.Deno("POST", "cruise-sync", "", body, c.deno)
			g := S.GoDoor("POST", "cruise-sync", "", body, c.goHeader)
			if c.status != 0 && (d.Status != c.status || g.Status != c.status) {
				t.Errorf("status: deno %d, go %d, want %d\n deno %s\n go   %s", d.Status, g.Status, c.status, d.Body, g.Body)
			}
			if d.Status < 400 || g.Status < 400 {
				t.Errorf("a caller got through: deno %d, go %d", d.Status, g.Status)
			}
			var p struct {
				Detail string `json:"detail"`
			}
			_ = json.Unmarshal([]byte(g.Body), &p)
			if p.Detail != c.goDetail {
				t.Errorf("go detail %q, want %q", p.Detail, c.goDetail)
			}
			t.Logf("deno %d %s | go %d %s", d.Status, d.Body, g.Status, g.Body)
		})
	}
}

// ---- the Go engine against this stack's tables, with a fake provider ----

// cruiseTrack answers like the relay, from fixtures, and counts what it was asked.
type cruiseTrack struct {
	mu      sync.Mutex
	paths   []string
	company string
	tag     string
	locale  string // what the detail endpoint answers in
}

func (f *cruiseTrack) RoundTrip(req *http.Request) (*http.Response, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.paths = append(f.paths, req.URL.Path)
	if req.Header.Get("X-RapidAPI-Key") == "" || req.URL.Host != "cruise-pricing-api1.p.rapidapi.com" {
		return csReply(401, `{"message":"Invalid API key."}`), nil
	}
	if q := req.URL.Query().Get("company"); q != f.company {
		return csReply(400, `{"code":"bad_company","detail":"unexpected company"}`), nil
	}
	portA, portB := "Difftest Port A "+f.tag, "Difftest Port B "+f.tag
	ship := "Difftest Ship " + f.tag
	sailing := func(locale string, cabins bool) map[string]any {
		s := map[string]any{
			"cruise_id": "DT" + f.tag, "company": f.company, "locale": locale, "ship_name": " " + ship + " ",
			"title": " Difftest Caribbean " + f.tag + " ", "departure_date": "2027-05-01T00:00:00-05:00",
			"duration": 7, "price": 1199.995, "currency": "usd", "price_euro": 1100.5,
			"destinations": []string{"Caribbean", "Caribbean", " Bahamas "},
			"ports_list": []map[string]any{
				{"port": portA, "day": 1},
				{"port": " ", "day": 2},
				{"port": portB, "day": nil, "arrival": "2027-05-02T08:00:00+00:00"},
			},
			"itinerary_url": "https://example.com/dt", "updated_at": "2026-11-01T10:00:00Z",
		}
		if cabins {
			s["cabin_prices_per_person"] = map[string]any{"interior": 899.99, "balcony suite": 1500}
		}
		return s
	}
	var body any
	switch {
	case req.URL.Path == "/coverage":
		body = map[string]any{"data": []map[string]any{{
			"company": f.company, "display_name": " Difftest Line " + f.tag + " ", "total_sailings": 3,
			"markets": []map[string]any{{"locale": "en_US"}, {"locale": "de_DE"}},
		}}}
	case req.URL.Path == "/filter-options":
		body = map[string]any{"data": map[string]any{
			"ports": []string{portA, "'" + portA + "'", " "},
			"ships": []string{ship},
		}}
	case req.URL.Path == "/cruises":
		body = map[string]any{"data": []any{sailing("en_US", false), map[string]any{"cruise_id": "broken"}}, "has_more": false}
	case strings.HasPrefix(req.URL.Path, "/cruises/"):
		body = map[string]any{"data": sailing(f.locale, true)}
	default:
		return csReply(404, `{"code":"not_found","detail":"no such endpoint"}`), nil
	}
	b, _ := json.Marshal(body)
	r := csReply(200, string(b))
	r.Header.Set("x-ratelimit-requests-limit", "100")
	r.Header.Set("x-ratelimit-requests-remaining", "97")
	return r, nil
}

func csReply(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {"application/json"}},
		Body: io.NopCloser(strings.NewReader(body))}
}

// TestCruiseSyncGoAgainstTheStack runs the Go engine end to end on this stack's real tables
// with a fake provider: every PostgREST call shape (the upsert conflict targets, the paged id
// reuse, the port-call replace, the ledger and the run row) meets the real schema and its
// CHECKs. Go only: Deno cannot be pointed at a fake provider. Fixture rows only, all named by
// a fresh tag; the cruise_lines and ships scopes (which archive) are deliberately not run.
func TestCruiseSyncGoAgainstTheStack(t *testing.T) {
	ctx := context.Background()
	tag := Unique()
	company := "difftest-" + tag
	track := &cruiseTrack{company: company, tag: tag, locale: "en_US"}
	fn := cruisesync.New(cruisesync.Options{HTTP: &http.Client{Transport: track}})
	deps := &edge.Deps{
		DB:  S.DB,
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now: time.Now,
		Env: func(k string) string {
			if k == "TRACK_CRUISES_API_KEY" {
				return "difftest-fake-provider-key"
			}
			return ""
		},
	}
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}

	var runIDs []string
	// Registered first, so it runs last: nothing this test made may outlive it.
	t.Cleanup(func() {
		c := context.Background()
		left := func(q interface {
			Rows(context.Context, any) error
		}) int {
			var rows []json.RawMessage
			_ = q.Rows(c, &rows)
			return len(rows)
		}
		n := left(S.DB.From("cruise_line").Select("id").Eq("slug", company)) +
			left(S.DB.From("cruise_port").Select("id").Like("name", "*Difftest Port * "+tag+"*")) +
			left(S.DB.From("cruise_sync_scope").Select("id").Like("label", "difftest-"+tag+"-*")) +
			left(S.DB.From("cruise_api_request").Select("id").Eq("path", "/cruises/DT"+tag))
		if len(runIDs) > 0 {
			n += left(S.DB.From("cruise_sync_run").Select("id").In("id", runIDs))
		}
		if n != 0 {
			t.Errorf("%d fixture rows outlived the test", n)
		}
	})

	scopes := map[string]string{}
	for i, s := range []struct{ suffix, endpoint string }{{"coverage", "coverage"}, {"filters", "filter_options"}, {"sailings", "cruises"}} {
		id, label := uuid.New(), "difftest-"+tag+"-"+s.suffix
		scopes[s.suffix] = label
		row := js.O("id", id, "label", label, "endpoint", s.endpoint, "enabled", true, "priority", 900+i, "company", company,
			"min_interval_days", 0, "max_rows_per_request", 10, "max_requests_per_run", 1)
		if s.endpoint == "cruises" {
			row = append(row, js.O("locale", "en_US", "destination", "Caribbean", "departure_within_days", 548,
				"departure_offset_days", 90)...)
		}
		must(S.DB.From("cruise_sync_scope").Insert(ctx, row, nil))
		t.Cleanup(func() { _ = S.DB.From("cruise_sync_scope").Eq("id", id).Delete(context.Background(), nil) })
	}
	t.Cleanup(func() {
		c := context.Background()
		var lines []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("cruise_line").Select("id").Eq("slug", company).Rows(c, &lines)
		for _, l := range lines {
			_ = S.DB.From("cruise_sailing").Eq("cruise_line_id", l.ID).Delete(c, nil) // port calls and cabin prices cascade
			_ = S.DB.From("cruise_ship").Eq("cruise_line_id", l.ID).Delete(c, nil)
			_ = S.DB.From("cruise_line").Eq("id", l.ID).Delete(c, nil)
		}
		_ = S.DB.From("cruise_port").Like("name", "*Difftest Port * "+tag+"*").Delete(c, nil)
		if len(runIDs) > 0 {
			_ = S.DB.From("cruise_api_request").In("run_id", runIDs).Delete(c, nil)
			_ = S.DB.From("cruise_sync_run").In("id", runIDs).Delete(c, nil)
		}
		_ = S.DB.From("cruise_api_request").Eq("path", "/cruises/DT"+tag).Delete(c, nil)
	})

	call := func(body string) (int, js.Value) {
		t.Helper()
		r := httptest.NewRequest("POST", "/functions/v1/cruise-sync", strings.NewReader(body))
		out, err := fn(deps, r)
		if err != nil {
			t.Fatalf("%s: %v", body, err)
		}
		b, err := js.Marshal(out.Body)
		must(err)
		v, err := js.Parse(b)
		must(err)
		if id, ok := v.Get("runId").Str(); ok {
			runIDs = append(runIDs, id)
		}
		return out.Status, v
	}
	run := func(label string) js.Value {
		t.Helper()
		status, v := call(`{"trigger":"manual","scope":"` + label + `"}`)
		if s, _ := v.Get("status").Str(); status != 200 || s == "failed" {
			b, _ := v.MarshalJSON()
			t.Fatalf("%s: %d %s", label, status, b)
		}
		return v
	}

	run(scopes["coverage"])
	run(scopes["filters"])
	first := run(scopes["sailings"])
	// One good sailing and one the mapper cannot read: stored, ok, and the drop is named.
	if s, _ := first.Get("status").Str(); s != "ok" || !strings.Contains(csJSON(first.Get("notes")), "dropped 1 sailing(s): the provider payload did not map") {
		b, _ := first.MarshalJSON()
		t.Errorf("first sailing pass: %s", b)
	}

	var line []struct {
		ID           string   `json:"id"`
		Name         string   `json:"name"`
		SailingCount *int64   `json:"sailing_count"`
		Locales      []string `json:"locales"`
		Provider     *string  `json:"provider"`
		ProviderKey  *string  `json:"provider_key"`
	}
	must(S.DB.From("cruise_line").Select("id,name,sailing_count,locales,provider,provider_key").Eq("slug", company).Rows(ctx, &line))
	if len(line) != 1 || line[0].Name != "Difftest Line "+tag || line[0].SailingCount == nil || *line[0].SailingCount != 3 ||
		strings.Join(line[0].Locales, ",") != "en_US,de_DE" || csDeref(line[0].ProviderKey) != company {
		t.Fatalf("cruise_line: %+v", line)
	}

	// The cleanup's own patterns find what the run made (so its leftover check is not vacuous).
	var ports []json.RawMessage
	must(S.DB.From("cruise_port").Select("id").Like("name", "*Difftest Port * "+tag+"*").Rows(ctx, &ports))
	if len(ports) != 2 {
		t.Errorf("fixture ports: %d, want 2 (A from the vocabulary, B from the itinerary)", len(ports))
	}

	type csSailingRow struct {
		ID             string   `json:"id"`
		ShipID         *string  `json:"ship_id"`
		Title          *string  `json:"title"`
		DepartureDate  string   `json:"departure_date"`
		DurationNights *int64   `json:"duration_nights"`
		LeadPriceCents *int64   `json:"lead_price_cents"`
		Currency       *string  `json:"currency"`
		EurCents       *int64   `json:"lead_price_eur_cents"`
		Destinations   []string `json:"destinations"`
	}
	readSailing := func() csSailingRow {
		t.Helper()
		var rows []csSailingRow
		must(S.DB.From("cruise_sailing").Select("id,ship_id,title,departure_date,duration_nights,lead_price_cents,currency,lead_price_eur_cents,destinations").
			Eq("cruise_line_id", line[0].ID).Rows(ctx, &rows))
		if len(rows) != 1 {
			t.Fatalf("sailings: %+v", rows)
		}
		return rows[0]
	}
	s1 := readSailing()
	if s1.DepartureDate != "2027-05-01" || s1.LeadPriceCents == nil || *s1.LeadPriceCents != 120000 || csDeref(s1.Currency) != "USD" ||
		s1.EurCents == nil || *s1.EurCents != 110050 || s1.ShipID == nil || csDeref(s1.Title) != "Difftest Caribbean "+tag ||
		strings.Join(s1.Destinations, ",") != "Caribbean,Bahamas" {
		t.Errorf("sailing: %+v", s1)
	}
	portCalls := func(id string) string {
		var calls []struct {
			PortName string  `json:"port_name"`
			Sequence int64   `json:"sequence"`
			PortID   *string `json:"port_id"`
		}
		must(S.DB.From("cruise_port_call").Select("port_name,sequence,port_id").Eq("sailing_id", id).Order("sequence", true).Rows(ctx, &calls))
		var out []string
		for _, c := range calls {
			has := "no port"
			if c.PortID != nil {
				has = "port"
			}
			out = append(out, c.PortName+"#"+js.NumberString(float64(c.Sequence))+" "+has)
		}
		return strings.Join(out, "; ")
	}
	wantCalls := "Difftest Port A " + tag + "#1 port; Difftest Port B " + tag + "#2 port"
	if got := portCalls(s1.ID); got != wantCalls {
		t.Errorf("port calls: %s", got)
	}

	// The second pass of the same sailing keeps its id (the primary-key churn the id reuse
	// prevents would fail here on cruise_port_call's foreign key) and replaces its port calls.
	run(scopes["sailings"])
	if s2 := readSailing(); s2.ID != s1.ID {
		t.Errorf("the sailing's id changed on re-sync: %s -> %s", s1.ID, s2.ID)
	}
	if got := portCalls(s1.ID); got != wantCalls {
		t.Errorf("port calls after re-sync: %s", got)
	}
	// And the filter pass again, onto rows that now exist (cruise_port and cruise_ship ids reused).
	run(scopes["filters"])

	// The demand-driven refetch, same market: pricing refreshed, cabin prices stored.
	status, v := call(`{"sailingId":"` + s1.ID + `"}`)
	if n, _ := v.Get("cabinPricesWritten").Num(); status != 200 || n != 2 || v.Has("skipped") {
		b, _ := v.MarshalJSON()
		t.Errorf("refetch: %d %s", status, b)
	}
	var cabins []struct {
		Code   string `json:"cabin_code"`
		Cents  int64  `json:"price_cents"`
		Locale string `json:"provider_locale"`
	}
	must(S.DB.From("cruise_sailing_cabin_price").Select("cabin_code,price_cents,provider_locale").Eq("sailing_id", s1.ID).
		Order("cabin_code", true).Rows(ctx, &cabins))
	if len(cabins) != 2 || cabins[0].Code != "BALCONY_SUITE" || cabins[0].Cents != 150000 || cabins[1].Code != "INTERIOR" || cabins[1].Cents != 89999 {
		t.Errorf("cabin prices: %+v", cabins)
	}

	// Another market: the lead fare is left alone and the reply says why.
	track.locale = "de_DE"
	status, v = call(`{"sailingId":"` + s1.ID + `"}`)
	if sk, _ := v.Get("skipped").Str(); status != 200 || !strings.HasPrefix(sk, "provider answered in de_DE, not the row's en_US") {
		b, _ := v.MarshalJSON()
		t.Errorf("refetch in another market: %d %s", status, b)
	}
	if s3 := readSailing(); s3.LeadPriceCents == nil || *s3.LeadPriceCents != 120000 || csDeref(s3.Currency) != "USD" {
		t.Errorf("the lead fare moved: %+v", s3)
	}

	// Every run left its row, closed; every request its ledger row; every run its audit row.
	var runs []struct {
		Status        string  `json:"status"`
		FinishedAt    *string `json:"finished_at"`
		RequestsSpent int64   `json:"requests_spent"`
	}
	must(S.DB.From("cruise_sync_run").Select("status,finished_at,requests_spent").In("id", runIDs).Rows(ctx, &runs))
	var ledger []json.RawMessage
	must(S.DB.From("cruise_api_request").Select("id").In("run_id", runIDs).Rows(ctx, &ledger))
	var audits []json.RawMessage
	must(S.DB.From("audit_event").Select("id").Eq("event_type", "cruise.synced").In("target_id", runIDs).Rows(ctx, &audits))
	if len(runs) != 5 || len(ledger) != 5 || len(audits) != 5 {
		t.Errorf("runs %d, ledger %d, audits %d; want 5 each", len(runs), len(ledger), len(audits))
	}
	for _, r := range runs {
		if r.Status == "running" || r.FinishedAt == nil || r.RequestsSpent != 1 {
			t.Errorf("run row: %+v", r)
		}
	}
	if len(track.paths) != 7 {
		t.Errorf("provider requests: %d %v (want 5 runs + 2 refetches)", len(track.paths), track.paths)
	}
}

func csDeref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func csJSON(v js.Value) string {
	b, _ := v.MarshalJSON()
	return string(b)
}
