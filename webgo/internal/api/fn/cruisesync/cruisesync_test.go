package cruisesync

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The handler (index.ts): its order of checks, its replies and its audit rows. No database and
// no provider: the fake store and the fake relay stand in.

func post(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/functions/v1/cruise-sync", strings.NewReader(body))
}

func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != status || p.Detail != detail {
		t.Fatalf("want %d %q, got %v", status, detail, err)
	}
}

func marshal(t *testing.T, v any) string {
	t.Helper()
	b, err := js.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestTheOrderOfChecksIsDenos(t *testing.T) {
	noKey := func() *engine {
		e := testEngine(newFakeDB(script{}), nil)
		e.env = func(string) string { return "" }
		return e
	}
	const unset = "TRACK_CRUISES_API_KEY is not set in the function environment. See supabase/README.md."

	// The method first: a GET is refused whatever it carries.
	_, err := noKey().handle(httptest.NewRequest(http.MethodGet, "/", strings.NewReader(`{"sailingId":"x"}`)))
	wantProblem(t, err, 403, "Use POST to run the cruise sync.")

	// Then the body: a bad sailingId is a 400 even with no key configured.
	for _, body := range []string{`{"sailingId":"x"}`, `{"sailingId":null}`, `{"sailingId":12}`, `{"sailingId":""}`,
		`{"sailingId":" 0190f3b2-1c4e-7d6a-9b2f-3e4d5c6b7a89 "}`, `{"sailingId":{}}`} {
		_, err := noKey().handle(post(body))
		wantProblem(t, err, 400, "sailingId must be a UUID.")
	}

	// Then the key. Every other body reaches it.
	for _, body := range []string{"", "{", "null", "[]", `"x"`, "1", `{"trigger":"cron"}`, `{"trigger":"manual","scope":7}`,
		`{"sailingId":"0190F3B2-1C4E-7D6A-9B2F-3E4D5C6B7A89"}`} {
		_, err := noKey().handle(post(body))
		wantProblem(t, err, 403, unset)
	}
}

func TestReadBody(t *testing.T) {
	cases := []struct {
		body string
		want input
	}{
		{"", input{trigger: "cron"}},
		{"not json", input{trigger: "cron"}},
		{`{"trigger":"cron"}`, input{trigger: "cron"}},
		{`{"trigger":"manual"}`, input{trigger: "manual"}},
		{`{"trigger":"MANUAL"}`, input{trigger: "cron"}},
		{`{"trigger":"manual","scope":"  ports:all \n"}`, input{trigger: "manual", scope: "ports:all"}},
		{`{"scope":"   "}`, input{trigger: "cron"}},
		{`{"scope":["x"]}`, input{trigger: "cron"}},
		{`{"sailingId":"0190f3b2-1c4e-7d6a-9b2f-3e4d5c6b7a89"}`, input{trigger: "cron", sailingID: "0190f3b2-1c4e-7d6a-9b2f-3e4d5c6b7a89"}},
		{`[{"trigger":"manual"}]`, input{trigger: "cron"}},
	}
	for _, c := range cases {
		got, err := readBody(post(c.body))
		if err != nil || got != c.want {
			t.Errorf("%q: %+v %v", c.body, got, err)
		}
	}
}

func TestASyncRepliesAndAuditsAsDenoDid(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{}})
	e := testEngine(db, nil)
	reply, err := e.handle(post(`{"trigger":"manual","scope":" sailings:rc "}`))
	if err != nil {
		t.Fatal(err)
	}
	runID, _ := field(opened(db.writes).payload, "id")
	want := `{"runId":"` + runID.(string) + `","status":"ok","scopesRun":0,"requestsSpent":0,"rowsUpserted":0,"rowsArchived":0,` +
		`"budget":{"monthToDateSpend":0,"ceiling":90,"allowanceRemaining":90,"providerRemaining":null,"drift":null},"notes":[]}`
	if got := marshal(t, reply.Body); reply.Status != 200 || got != want {
		t.Errorf("reply %d\n got  %s\n want %s", reply.Status, got, want)
	}
	if len(db.audits) != 1 {
		t.Fatalf("audit rows: %d", len(db.audits))
	}
	a := string(db.audits[0])
	for _, part := range []string{
		`"actor_user_id":null,"actor_role":null,"event_type":"cruise.synced","target_entity":"cruise_sync_run","target_id":"` + runID.(string) + `"`,
		`"metadata":{"trigger":"manual","scope":"sailings:rc","status":"ok","scopesRun":0,"requestsSpent":0,"rowsUpserted":0,` +
			`"rowsArchived":0,"monthToDateSpend":0,"ceiling":90,"quotaRemaining":null,"quotaDrift":null,"notes":[]}`,
		`"ip_address":null,"user_agent":null`,
	} {
		if !strings.Contains(a, part) {
			t.Errorf("audit row %s\n lacks %s", a, part)
		}
	}
}

func TestAnUnscopedCronRunLeavesScopeOutOfTheAuditRow(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{}})
	if _, err := testEngine(db, nil).handle(post(`{"trigger":"cron"}`)); err != nil {
		t.Fatal(err)
	}
	if a := string(db.audits[0]); strings.Contains(a, `"scope"`) || !strings.Contains(a, `"metadata":{"trigger":"cron","status":"ok"`) {
		t.Errorf("audit row %s", a)
	}
}

func TestTheCeilingComesFromTheEnvironment(t *testing.T) {
	db := newFakeDB(script{ledgerSpent: 95, scopes: []scopeRow{}})
	e := testEngine(db, nil)
	e.env = func(k string) string {
		return map[string]string{"TRACK_CRUISES_API_KEY": "k", "CRUISE_SYNC_MONTHLY_CEILING": " 10000"}[k]
	}
	reply, err := e.handle(post(""))
	if err != nil {
		t.Fatal(err)
	}
	if got := marshal(t, reply.Body); !strings.Contains(got, `"status":"ok"`) || !strings.Contains(got, `"ceiling":10000,"allowanceRemaining":9905`) {
		t.Errorf("reply %s", got)
	}
}

func TestAFailedRunIsA500AfterItsRowIsClosed(t *testing.T) {
	db := newFakeDB(script{scopeError: "boom"})
	_, err := testEngine(db, nil).handle(post(""))
	if _, isProblem := problem.As(err); err == nil || isProblem {
		t.Fatalf("want a bare error (a 500), got %v", err)
	}
	if c := closed(db.writes); c == nil {
		t.Fatal("not closed")
	}
	// No audit row: the Deno handler threw before writing it.
	if len(db.audits) != 0 {
		t.Errorf("audit rows: %d", len(db.audits))
	}
}

func TestAnAuditWriteThatFailsFailsTheRequest(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{}, failOn: map[string]string{"InsertRows": "audit_event is down"}})
	if _, err := testEngine(db, nil).handle(post("")); err == nil || !strings.HasPrefix(err.Error(), "system audit write failed for cruise.synced") {
		t.Fatalf("got %v", err)
	}
}

// Go only. Deno threw before inserting the run row when the ledger read failed, so that run
// left no record. Each run must leave one (Track B decision).
func TestALedgerReadThatFailsStillLeavesAClosedRunRow(t *testing.T) {
	db := newFakeDB(script{failOn: map[string]string{"countRequestsSince": "permission denied for table cruise_api_request"}})
	_, err := testEngine(db, nil).runSync(context.Background(), baseOpts())
	if err == nil || err.Error() != "cruise budget read failed: permission denied for table cruise_api_request" {
		t.Fatalf("got %v", err)
	}
	if opened(db.writes) == nil {
		t.Fatal("no run row")
	}
	c := closed(db.writes)
	if c == nil {
		t.Fatal("not closed")
	}
	if v, _ := c.get("error_code"); v != "run_threw" {
		t.Errorf("error_code %v", v)
	}
	if v, _ := c.get("error_detail"); v != "run aborted: cruise budget read failed: permission denied for table cruise_api_request" {
		t.Errorf("error_detail %v", v)
	}
}

// Go only. pg_net gives up on the tick after 10 seconds; a run that followed the request's
// context would be abandoned mid-scope with its row at `running`.
func TestARunOutlivesItsCallerHangingUp(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 2)}})
	r := newRelay(nil, relayOpts{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the caller is already gone
	req := post(`{"trigger":"cron"}`).WithContext(ctx)
	reply, err := testEngine(db, r.client()).handle(req)
	if err != nil {
		t.Fatal(err)
	}
	if r.callsFor("rc") != 2 {
		t.Errorf("rc calls %d", r.callsFor("rc"))
	}
	if got := marshal(t, reply.Body); !strings.Contains(got, `"status":"ok","scopesRun":1,"requestsSpent":2`) {
		t.Errorf("reply %s", got)
	}
	if v, _ := closed(db.writes).get("status"); v != "ok" {
		t.Errorf("closed as %v", v)
	}
}

// ---- redirects (Track B decision 1) ----

func redirecting(u *url.URL) (int, string, http.Header) {
	return 301, "", http.Header{"Location": {"https://elsewhere.example/steal-the-key"}}
}

func TestARedirectIsPermanentForTheRun(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 3), sailingScope("celebrity", 1)}})
	r := newRelay(nil, relayOpts{})
	r.route = redirecting
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	// ONE request: not followed (the key never goes to the Location's host), not retried,
	// and no other scope spends a request on the same answer.
	if len(r.calls) != 1 || r.calls[0].Host != "cruise-pricing-api1.p.rapidapi.com" {
		t.Fatalf("calls: %v", r.calls)
	}
	ledger := db.writesTo("cruise_api_request", "insert")
	if len(ledger) != 1 {
		t.Fatalf("ledger rows %d", len(ledger))
	}
	if v, _ := ledger[0].get("status_code"); flat(v) == nil {
		t.Error("the ledger row has no status")
	}
	rc := scopeUpdates(db.writes, "rc")
	if len(rc) != 1 {
		t.Fatalf("rc writes %d", len(rc))
	}
	if v, _ := rc[0].get("last_status"); v != "failed" {
		t.Errorf("last_status %v", v)
	}
	if v, _ := rc[0].get("last_error"); v != "http_301: HTTP 301" {
		t.Errorf("last_error %v", v)
	}
	if len(scopeUpdates(db.writes, "celebrity")) != 0 {
		t.Error("celebrity was touched")
	}
	if out.Status != "failed" || out.RequestsSpent != 1 {
		t.Errorf("status %q spent %d", out.Status, out.RequestsSpent)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "provider_redirected" {
		t.Errorf("error_code %v", v)
	}
	if !hasNotePrefix(out.Notes, "stopped after sailings:rc:caribbean: the provider answered with a redirect") {
		t.Errorf("notes %q", out.Notes)
	}
}

func TestAServerErrorIsStillRetriedUnlikeARedirect(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 1)}})
	r := newRelay(nil, relayOpts{})
	r.route = func(*url.URL) (int, string, http.Header) { return 503, `{"message":"busy"}`, nil }
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 3 || out.RequestsSpent != 3 || out.Status != "failed" {
		t.Errorf("calls %d spent %d status %q", len(r.calls), out.RequestsSpent, out.Status)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "all_scopes_failed" {
		t.Errorf("error_code %v", v)
	}
}

func TestARedirectOnARefetchIsA500AndOneLedgerRow(t *testing.T) {
	db := newFakeDB(refetchScript("en_US"))
	r := newRelay(nil, relayOpts{})
	r.route = redirecting
	_, err := testEngine(db, r.client()).refetchSailing(context.Background(), refetchID, base)
	if !isRedirect(err) {
		t.Fatalf("got %v", err)
	}
	if len(r.calls) != 1 || len(db.writesTo("cruise_api_request", "insert")) != 1 {
		t.Errorf("calls %d", len(r.calls))
	}
}
