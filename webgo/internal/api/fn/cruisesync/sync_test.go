package cruisesync

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

// Ported from supabase/functions/_shared/cruise/sync_test.ts, one Go test per Deno.test (16).
//
// The run lifecycle: the cruise catalog once sat empty for weeks while cron, pg_net and an
// empty cruise_sync_run table all read as success. What is pinned here is that failure has to
// be visible somewhere:
//
//  1. A run row is opened as `running` BEFORE any work, so an abandoned run is detectable.
//  2. EVERY exit path closes it.
//  3. `error_code` says WHY, not WHAT.
//
// Then pacing and reach: the first production run that reached the provider spent 11 requests
// in 16 seconds, took a per-minute 429 on every scope after that, and stored 40 sailings that
// all left within a week.
//
// The fake database (fakeDB, fakes_test.go) answers what runSync asks and captures every write
// rather than applying it, exactly as the Deno fakeDb did; the fake relay (relay) stands in
// for fetch.

func runRows(writes []write) []write {
	var out []write
	for _, w := range writes {
		if w.table == "cruise_sync_run" {
			out = append(out, w)
		}
	}
	return out
}

func opened(writes []write) *write {
	for _, w := range runRows(writes) {
		if w.op == "insert" {
			return &w
		}
	}
	return nil
}

func closed(writes []write) *write {
	for _, w := range runRows(writes) {
		if w.op == "update" {
			return &w
		}
	}
	return nil
}

var base = time.Date(2026, 9, 28, 9, 17, 0, 0, time.UTC)

func baseOpts() syncOptions { return syncOptions{trigger: "cron", now: base} }

// Deno.test("a run opens as 'running' before any work, so an abandoned one is detectable")
func TestARunOpensAsRunningBeforeAnyWork(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{}})
	if _, err := testEngine(db, nil).runSync(context.Background(), baseOpts()); err != nil {
		t.Fatal(err)
	}
	open := opened(db.writes)
	if open == nil {
		t.Fatal("no cruise_sync_run row was inserted")
	}
	if v, _ := open.get("status"); v != "running" {
		t.Errorf("status = %v", v)
	}
	if _, has := open.get("finished_at"); has {
		t.Error("finished_at was set on the opening insert")
	}
	// Zero rows in this table is ALSO what a project that has never synced looks like. The
	// row existing at all is what lets cruise_sync_watchdog() tell those two apart.
	if v, _ := open.get("id"); v == nil || v == "" {
		t.Error("no id")
	}
}

// Deno.test("a scope read that fails CLOSES the run row instead of stranding it")
func TestAScopeReadThatFailsClosesTheRunRow(t *testing.T) {
	db := newFakeDB(script{scopeError: "relation does not exist"})
	_, err := testEngine(db, nil).runSync(context.Background(), baseOpts())
	if err == nil || !strings.Contains(err.Error(), "cruise scope read failed") {
		t.Fatalf("want the scope read error, got %v", err)
	}
	c := closed(db.writes)
	if c == nil {
		t.Fatal("the run row was never closed: it is stranded at 'running'")
	}
	if v, _ := c.get("status"); v != "failed" {
		t.Errorf("status = %v", v)
	}
	if v, _ := c.get("error_code"); v != "run_threw" {
		t.Errorf("error_code = %v", v)
	}
	if v, _ := c.get("finished_at"); v == nil {
		t.Error("no finished_at")
	}
	// The cause survives into the row, not only into the returned error.
	if v, _ := c.get("error_detail"); !strings.Contains(fmt.Sprint(v), "relation does not exist") {
		t.Errorf("error_detail = %v", v)
	}
}

// Deno.test("it still rethrows, so the caller's 5xx and the run row agree")
func TestItStillRethrows(t *testing.T) {
	db := newFakeDB(script{scopeError: "boom"})
	if _, err := testEngine(db, nil).runSync(context.Background(), baseOpts()); err == nil {
		t.Fatal("the failure was swallowed")
	}
}

// Deno.test("an exhausted budget is 'skipped' with a cause, and spends nothing")
func TestAnExhaustedBudgetIsSkippedWithACause(t *testing.T) {
	db := newFakeDB(script{ledgerSpent: 90})
	out, err := testEngine(db, nil).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "skipped" || out.RequestsSpent != 0 {
		t.Errorf("status %q, spent %d", out.Status, out.RequestsSpent)
	}
	c := closed(db.writes)
	if c == nil {
		t.Fatal("not closed")
	}
	if v, _ := c.get("status"); v != "skipped" {
		t.Errorf("status = %v", v)
	}
	if v, _ := c.get("error_code"); v != "budget_exhausted" {
		t.Errorf("error_code = %v", v)
	}
}

// Deno.test("the relay's own number wins when it is stricter than our ceiling")
func TestTheRelaysOwnNumberWins(t *testing.T) {
	db := newFakeDB(script{ledgerSpent: 2, latestQuota: &quotaRow{QuotaLimit: i64(100), QuotaRemaining: i64(0)}})
	out, err := testEngine(db, nil).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "skipped" {
		t.Errorf("status %q", out.Status)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "budget_exhausted" {
		t.Errorf("error_code = %v", v)
	}
}

// Deno.test("nothing due is 'ok' with NO error code")
func TestNothingDueIsOKWithNoErrorCode(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{}})
	out, err := testEngine(db, nil).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if out.Status != "ok" || out.ScopesRun != 0 {
		t.Errorf("status %q, scopes %d", out.Status, out.ScopesRun)
	}
	c := closed(db.writes)
	if c == nil {
		t.Fatal("not closed")
	}
	if v, _ := c.get("status"); v != "ok" {
		t.Errorf("status = %v", v)
	}
	if v, has := c.get("error_code"); !has || v != nil {
		t.Errorf("error_code = %v (present %v), want null", v, has)
	}
}

// Deno.test("error_code is a CAUSE, never a restatement of the status")
func TestErrorCodeIsACause(t *testing.T) {
	cases := []struct {
		s      script
		expect string
	}{
		{script{ledgerSpent: 90}, "budget_exhausted"},
		{script{scopeError: "nope"}, "run_threw"},
	}
	for _, c := range cases {
		db := newFakeDB(c.s)
		_, _ = testEngine(db, nil).runSync(context.Background(), baseOpts())
		cl := closed(db.writes)
		if cl == nil {
			t.Fatalf("%+v: not closed", c.s)
		}
		code, _ := cl.get("error_code")
		status, _ := cl.get("status")
		if code != c.expect {
			t.Errorf("error_code = %v, want %s", code, c.expect)
		}
		if code == status {
			t.Errorf("error_code just restated the status: %v", status)
		}
	}
}

// Deno.test("every exit path closes the row — asserted as a sweep, not case by case")
func TestEveryExitPathClosesTheRow(t *testing.T) {
	scripts := []script{
		{scopes: []scopeRow{}},
		{ledgerSpent: 90},
		{scopeError: "nope"},
		{ledgerSpent: 2, latestQuota: &quotaRow{QuotaLimit: i64(100), QuotaRemaining: i64(0)}},
	}
	for _, s := range scripts {
		db := newFakeDB(s)
		_, _ = testEngine(db, nil).runSync(context.Background(), baseOpts())
		if opened(db.writes) == nil {
			t.Errorf("no run row opened for %+v", s)
		}
		c := closed(db.writes)
		if c == nil {
			t.Errorf("run row left at 'running' for %+v", s)
			continue
		}
		if v, _ := c.get("status"); v == "running" {
			t.Errorf("run closed as 'running' for %+v", s)
		}
		if v, _ := c.get("finished_at"); v == nil {
			t.Errorf("closed with no finished_at for %+v: the table's CHECK permits that only for 'running'", s)
		}
	}
}

// ---- pacing and reach ----

func sailingScope(company string, maxRequests int64, edit ...func(*scopeRow)) scopeRow {
	s := scopeRow{
		ID:                  "scope-" + company,
		Label:               "sailings:" + company + ":caribbean",
		Endpoint:            "cruises",
		Priority:            100,
		Company:             str(company),
		Locale:              str("en_US"),
		Destination:         str("Caribbean"),
		DepartureWithinDays: i64(548),
		DepartureOffsetDays: i64(90),
		Sort:                "departure_date:asc",
		MinIntervalDays:     6,
		MaxRowsPerRequest:   10,
		MaxRequestsPerRun:   maxRequests,
	}
	for _, e := range edit {
		e(&s)
	}
	return s
}

func scopeUpdates(writes []write, company string) []write {
	var out []write
	for _, w := range writes {
		if w.table == "cruise_sync_scope" && w.op == "update" && w.where["id"] == "scope-"+company {
			out = append(out, w)
		}
	}
	return out
}

func hasNotePrefix(notes []string, prefix string) bool {
	for _, n := range notes {
		if strings.HasPrefix(n, prefix) {
			return true
		}
	}
	return false
}

// Deno.test("a run starts no scope that would carry it past the per-minute cap, and leaves that scope due")
func TestARunStartsNoScopePastThePerMinuteCap(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{
		sailingScope("rc", 4), sailingScope("celebrity", 3), sailingScope("disney", 2), sailingScope("hal", 1),
	}})
	r := newRelay(nil, relayOpts{})
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	// 4 + 3 = 7; disney's 2 would make 9, so the run stops there.
	if len(r.calls) != 7 {
		t.Errorf("calls = %d, want 7", len(r.calls))
	}
	if r.callsFor("disney") != 0 {
		t.Error("disney was called")
	}
	// STOPS rather than skipping ahead: hal's 1 would fit, but running it would put a
	// lower-priority scope ahead of disney, and disney would lose the same way every week.
	if r.callsFor("hal") != 0 {
		t.Error("hal was called")
	}
	// Deferred is not tried: no write to the scope, so it is still due for the next tick.
	if n := len(scopeUpdates(db.writes, "disney")); n != 0 {
		t.Errorf("disney got %d scope writes", n)
	}
	if v, _ := scopeUpdates(db.writes, "celebrity")[0].get("last_run_at"); v != iso(base) {
		t.Errorf("celebrity last_run_at = %v", v)
	}
	if out.Status != "ok" {
		t.Errorf("status %q", out.Status)
	}
	if v, has := closed(db.writes).get("error_code"); !has || v != nil {
		t.Errorf("error_code = %v", v)
	}
	if !hasNotePrefix(out.Notes, "deferred sailings:disney:caribbean") {
		t.Errorf("notes = %q", out.Notes)
	}
}

// Deno.test("the first scope of a run always goes, so one sized above the cap is not deferred forever")
func TestTheFirstScopeOfARunAlwaysGoes(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 4), sailingScope("celebrity", 1)}})
	r := newRelay(nil, relayOpts{})
	o := baseOpts()
	o.maxRequestsPerRun = 3
	if _, err := testEngine(db, r.client()).runSync(context.Background(), o); err != nil {
		t.Fatal(err)
	}
	if r.callsFor("rc") != 4 || r.callsFor("celebrity") != 0 {
		t.Errorf("rc %d, celebrity %d", r.callsFor("rc"), r.callsFor("celebrity"))
	}
}

// Deno.test("a per-minute 429 stops the run and does NOT stamp the throttled scope as run")
func TestAPerMinute429StopsTheRunAndDoesNotStamp(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 2), sailingScope("celebrity", 2), sailingScope("disney", 2)}})
	r := newRelay([]string{"celebrity"}, relayOpts{})
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	// One attempt at celebrity, not three: a 429 with no Retry-After is not retried in-run.
	if r.callsFor("rc") != 2 || r.callsFor("celebrity") != 1 {
		t.Errorf("rc %d, celebrity %d", r.callsFor("rc"), r.callsFor("celebrity"))
	}
	// Everything after it waits for the next tick instead of taking the same 429.
	if r.callsFor("disney") != 0 || len(scopeUpdates(db.writes, "disney")) != 0 {
		t.Error("disney was touched")
	}
	// Stamping last_run_at would make it sit out a whole week having fetched nothing.
	throttled := scopeUpdates(db.writes, "celebrity")
	if len(throttled) != 1 {
		t.Fatalf("celebrity writes = %d", len(throttled))
	}
	if _, has := throttled[0].get("last_run_at"); has {
		t.Error("the throttled scope was stamped as run")
	}
	if v, _ := throttled[0].get("last_status"); v != "failed" {
		t.Errorf("last_status = %v", v)
	}
	if out.Status != "partial" {
		t.Errorf("status %q", out.Status)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "rate_limited" {
		t.Errorf("error_code = %v", v)
	}
}

// Deno.test("a sailing scope's window opens departure_offset_days out, not today")
func TestASailingScopesWindowOpensOffsetDaysOut(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{
		sailingScope("rc", 1),
		sailingScope("celebrity", 1, func(s *scopeRow) { s.DepartureOffsetDays = i64(0) }),
	}})
	r := newRelay(nil, relayOpts{})
	if _, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts()); err != nil {
		t.Fatal(err)
	}
	after := func(company string) string {
		for _, u := range r.calls {
			if u.Query().Get("company") == company {
				return u.Query().Get("departure_after")
			}
		}
		return ""
	}
	// base is 2026-09-28; 90 days on is 2026-12-27.
	if got := after("rc"); got != "2026-12-27" {
		t.Errorf("rc departure_after = %q", got)
	}
	if got := after("celebrity"); got != "2026-09-28" {
		t.Errorf("celebrity departure_after = %q", got)
	}
}

// Deno.test("a sailing scope that ran earlier this Monday is not re-run by the next tick")
func TestASailingScopeThatRanEarlierIsNotReRun(t *testing.T) {
	// The gate that makes four ticks safe. Without it every tick re-spends every scope.
	threeMinutesAgo := iso(base.Add(-3 * time.Minute))
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 4, func(s *scopeRow) { s.LastRunAt = &threeMinutesAgo })}})
	r := newRelay(nil, relayOpts{})
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 0 || out.Status != "ok" {
		t.Errorf("calls %d, status %q", len(r.calls), out.Status)
	}
}

// Deno.test("a 429 partway through a scope keeps the pages and the cursor it already bought")
func TestA429PartwayKeepsThePagesAndTheCursor(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 4), sailingScope("celebrity", 2)}})
	// Two good pages, then the per-minute limit.
	r := newRelay([]string{"rc"}, relayOpts{after: 2})
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if r.callsFor("rc") != 3 || r.callsFor("celebrity") != 0 {
		t.Errorf("rc %d, celebrity %d", r.callsFor("rc"), r.callsFor("celebrity"))
	}
	rc := scopeUpdates(db.writes, "rc")
	if len(rc) != 1 {
		t.Fatalf("rc writes = %d", len(rc))
	}
	// The second page's next_cursor: the next tick resumes after it, not from the start.
	if v, _ := rc[0].get("cursor"); v != "page-2" {
		t.Errorf("cursor = %v", v)
	}
	if _, has := rc[0].get("last_run_at"); has {
		t.Error("stamped as run")
	}
	if out.Status != "partial" {
		t.Errorf("status %q", out.Status)
	}
	if v, _ := closed(db.writes).get("error_code"); v != "rate_limited" {
		t.Errorf("error_code = %v", v)
	}
}

// Deno.test("a 429 that says the MONTH is spent is not reported as the per-minute limit")
func TestA429ThatSaysTheMonthIsSpentIsNotThePerMinuteLimit(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 2)}})
	r := newRelay([]string{"rc"}, relayOpts{monthSpent: true})
	if _, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts()); err != nil {
		t.Fatal(err)
	}
	if v, _ := closed(db.writes).get("error_code"); v == "rate_limited" {
		t.Error("reported as the per-minute limit")
	}
	// The month will not come back in a minute, so the scope is stamped as tried.
	if v, _ := scopeUpdates(db.writes, "rc")[0].get("last_run_at"); v != iso(base) {
		t.Errorf("last_run_at = %v", v)
	}
}

// Deno.test("a tick steps aside while an earlier run is still going, and still closes its own row")
func TestATickStepsAsideWhileAnEarlierRunIsStillGoing(t *testing.T) {
	db := newFakeDB(script{scopes: []scopeRow{sailingScope("rc", 4)}, liveRun: true})
	r := newRelay(nil, relayOpts{})
	out, err := testEngine(db, r.client()).runSync(context.Background(), baseOpts())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 0 || out.Status != "skipped" {
		t.Errorf("calls %d, status %q", len(r.calls), out.Status)
	}
	// The watchdog matches a dispatch to a run row; a skipped tick must still leave one.
	if opened(db.writes) == nil {
		t.Error("no run row opened")
	}
	if v, _ := closed(db.writes).get("error_code"); v != "previous_run_running" {
		t.Errorf("error_code = %v", v)
	}
}
