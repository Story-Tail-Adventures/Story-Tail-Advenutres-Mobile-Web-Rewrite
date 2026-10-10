/**
 * Tests for the sync orchestrator's run lifecycle.
 *
 * `_shared/cruise/` had `client_test.ts` and `map_test.ts` and nothing for `runSync`, which
 * is the function that decides what a run is CALLED. That gap is the same shape as the
 * incident this file was written alongside: the cruise catalog sat empty for weeks while
 * cron, pg_net and an empty `cruise_sync_run` table all read as success.
 *
 * What is pinned here is the invariant that failure has to be visible somewhere:
 *
 *   1. A run row is opened as `running` BEFORE any work, so an abandoned run is detectable.
 *   2. EVERY exit path closes it. A throw between the insert and `finishRun` used to leave
 *      it at `running` forever, which the table's own CHECK permits and which its comment
 *      calls "a row nobody will ever reconcile".
 *   3. `error_code` says WHY, not WHAT. It used to be `status === "ok" ? null : status`, so
 *      the column restated the column beside it.
 *
 * NOT covered here, and stated rather than left to be discovered: the per-scope paths.
 * Reaching `spent_but_stored_nothing` needs a scope handler to run, which needs the HTTP
 * client and a much larger fake than the run lifecycle does. `runSync` takes `fetchImpl`
 * for exactly that, so it is reachable; it is simply not reached yet.
 */
import { assertEquals, assertExists, assertRejects } from "jsr:@std/assert@^1";
import type { Db } from "../db.ts";
import { runSync } from "./sync.ts";

type Write = {
  table: string;
  op: "insert" | "update" | "upsert";
  payload: _Payload;
  /** The `.eq()` filters on this write, so a test can tell WHICH scope row an update hit. */
  where?: _Payload;
};
// deno-lint-ignore no-explicit-any
type _Payload = Record<string, any>;

interface Script {
  /** Rows already in cruise_api_request this month, i.e. the ledger's spend. */
  ledgerSpent?: number;
  /** The newest relay quota headers on record, or null for none. */
  latestQuota?: { quota_limit: number | null; quota_remaining: number | null } | null;
  /** Make the scope read fail, which is the throw that used to strand the run row. */
  scopeError?: string;
  /** Scopes the run should see. Empty means nothing is due. */
  scopes?: _Payload[];
  /** Another run is still `running`, started inside the overlap window. */
  liveRun?: boolean;
}

/**
 * The smallest fake that answers what `runSync` actually asks of PostgREST.
 *
 * Every builder method returns `this` and the object is thenable, which is enough for the
 * four chains in play: the two `readBudget` reads, the scope read, and the run row's
 * insert/update pair. Writes are captured rather than applied, because what these tests
 * assert is what the run SAID about itself.
 */
function fakeDb(script: Script = {}): { db: Db; writes: Write[] } {
  const writes: Write[] = [];

  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "upsert" | null = null;
    let head = false;
    let mine: Write | undefined;

    const result = () => {
      if (table === "cruise_api_request" && op === "select") {
        return head
          ? { count: script.ledgerSpent ?? 0, error: null, data: null }
          : { data: script.latestQuota ?? null, error: null, count: null };
      }
      if (table === "cruise_sync_run" && op === "select") {
        return { data: script.liveRun ? [{ id: "earlier-run" }] : [], error: null, count: null };
      }
      if (table === "cruise_sync_scope" && op === "select") {
        return script.scopeError
          ? { data: null, error: { message: script.scopeError }, count: null }
          : { data: script.scopes ?? [], error: null, count: null };
      }
      return { data: null, error: null, count: null };
    };

    const self = {
      // deno-lint-ignore no-explicit-any
      select(_cols?: string, opts?: any) {
        op ??= "select";
        head = Boolean(opts?.head);
        return self;
      },
      insert(payload: _Payload) {
        op = "insert";
        mine = { table, op: "insert", payload };
        writes.push(mine);
        return self;
      },
      update(payload: _Payload) {
        op = "update";
        mine = { table, op: "update", payload };
        writes.push(mine);
        return self;
      },
      upsert(payload: _Payload) {
        op = "upsert";
        mine = { table, op: "upsert", payload };
        writes.push(mine);
        return self;
      },
      eq(column: string, value: unknown) {
        if (mine) mine.where = { ...mine.where, [column]: value };
        return self;
      },
      neq: () => self,
      gte: () => self,
      not: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: () => self,
      // deno-lint-ignore no-explicit-any
      then: (onOk: any, onErr?: any) => Promise.resolve(result()).then(onOk, onErr),
    };
    return self;
  };

  return { db: { from } as unknown as Db, writes };
}

const runRows = (writes: Write[]) => writes.filter((w) => w.table === "cruise_sync_run");
const opened = (writes: Write[]) => runRows(writes).find((w) => w.op === "insert");
const closed = (writes: Write[]) => runRows(writes).find((w) => w.op === "update");

const BASE = { apiKey: "test-key", trigger: "cron" as const, now: new Date("2026-09-28T09:17:00Z") };

Deno.test("a run opens as 'running' before any work, so an abandoned one is detectable", async () => {
  const { db, writes } = fakeDb({ scopes: [] });
  await runSync({ ...BASE, db });

  const open = opened(writes);
  assertExists(open, "no cruise_sync_run row was inserted");
  assertEquals(open.payload.status, "running");
  assertEquals(open.payload.finished_at, undefined);
  // Zero rows in this table is ALSO what a project that has never synced looks like. The
  // row existing at all is what lets cruise_sync_watchdog() tell those two apart.
  assertExists(open.payload.id);
});

Deno.test("a scope read that fails CLOSES the run row instead of stranding it", async () => {
  // THE REGRESSION THIS FILE EXISTS FOR. `if (scopeError) throw` sits after the insert and
  // before every finishRun call, so before the try/catch in runSync this threw straight
  // past the close and left status='running' with no finished_at. Nothing swept it, and
  // the CHECK on the table permits it forever.
  const { db, writes } = fakeDb({ scopeError: "relation does not exist" });

  await assertRejects(
    () => runSync({ ...BASE, db }),
    Error,
    "cruise scope read failed",
  );

  const close = closed(writes);
  assertExists(close, "the run row was never closed — it is stranded at 'running'");
  assertEquals(close.payload.status, "failed");
  assertEquals(close.payload.error_code, "run_threw");
  assertExists(close.payload.finished_at);
  // The cause survives into the row, not only into the thrown error.
  assertEquals(String(close.payload.error_detail).includes("relation does not exist"), true);
});

Deno.test("it still rethrows, so the caller's 5xx and the run row agree", async () => {
  // Closing the row must not swallow the failure: cruise-sync turns a throw into a 5xx and
  // the watchdog reads that status. A fix that made the database honest by making the HTTP
  // answer dishonest would have moved the problem rather than solved it.
  const { db } = fakeDb({ scopeError: "boom" });
  await assertRejects(() => runSync({ ...BASE, db }), Error);
});

Deno.test("an exhausted budget is 'skipped' with a cause, and spends nothing", async () => {
  // Late in the month on the free tier. Not a failure, and it must not look like one.
  const { db, writes } = fakeDb({ ledgerSpent: 90 });
  const outcome = await runSync({ ...BASE, db });

  assertEquals(outcome.status, "skipped");
  assertEquals(outcome.requestsSpent, 0);

  const close = closed(writes);
  assertExists(close);
  assertEquals(close.payload.status, "skipped");
  assertEquals(close.payload.error_code, "budget_exhausted");
});

Deno.test("the relay's own number wins when it is stricter than our ceiling", async () => {
  // The ledger says we have spent almost nothing; the relay says the plan is out. The
  // stricter answer has to win, or a run spends requests that will only 429.
  const { db, writes } = fakeDb({
    ledgerSpent: 2,
    latestQuota: { quota_limit: 100, quota_remaining: 0 },
  });
  const outcome = await runSync({ ...BASE, db });

  assertEquals(outcome.status, "skipped");
  assertEquals(closed(writes)?.payload.error_code, "budget_exhausted");
});

Deno.test("nothing due is 'ok' with NO error code", async () => {
  const { db, writes } = fakeDb({ scopes: [] });
  const outcome = await runSync({ ...BASE, db });

  assertEquals(outcome.status, "ok");
  assertEquals(outcome.scopesRun, 0);

  const close = closed(writes);
  assertExists(close);
  assertEquals(close.payload.status, "ok");
  assertEquals(close.payload.error_code, null);
});

Deno.test("error_code is a CAUSE, never a restatement of the status", async () => {
  // It was literally `status === "ok" ? null : status` — the column held "skipped" or
  // "failed", duplicating the column beside it while the real reason sat inside a
  // 2000-character prose blob with nothing to group or alert on.
  const cases: { script: Script; expect: string }[] = [
    { script: { ledgerSpent: 90 }, expect: "budget_exhausted" },
    { script: { scopeError: "nope" }, expect: "run_threw" },
  ];

  for (const c of cases) {
    const { db, writes } = fakeDb(c.script);
    await runSync({ ...BASE, db }).catch(() => {});
    const close = closed(writes);
    assertExists(close);
    assertEquals(close.payload.error_code, c.expect);
    assertEquals(
      close.payload.error_code === close.payload.status,
      false,
      `error_code just restated the status: ${close.payload.status}`,
    );
  }
});

Deno.test("every exit path closes the row — asserted as a sweep, not case by case", async () => {
  // The property, rather than three examples of it. A fourth exit added later without a
  // finishRun call fails here even if nobody thinks to write a test for it.
  const scripts: Script[] = [
    { scopes: [] },
    { ledgerSpent: 90 },
    { scopeError: "nope" },
    { ledgerSpent: 2, latestQuota: { quota_limit: 100, quota_remaining: 0 } },
  ];

  for (const script of scripts) {
    const { db, writes } = fakeDb(script);
    await runSync({ ...BASE, db }).catch(() => {});

    const open = opened(writes);
    const close = closed(writes);
    assertExists(open, `no run row opened for ${JSON.stringify(script)}`);
    assertExists(close, `run row left at 'running' for ${JSON.stringify(script)}`);
    assertEquals(
      close.payload.status === "running",
      false,
      `run closed as 'running' for ${JSON.stringify(script)}`,
    );
    assertExists(
      close.payload.finished_at,
      `closed with no finished_at for ${JSON.stringify(script)} — the table's CHECK ` +
        `permits that only for 'running', so this row is unreconcilable`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pacing and reach. The first production run that reached the provider spent 11 requests in
// 16 seconds, took a per-minute 429 on every scope after that, and stored 40 sailings that
// all left within a week. These pin the three rules that fix it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stand-in for the relay. `/cruises` answers an empty page that says there is more, so a
 * sailing scope spends exactly its `max_requests_per_run`. A company in `throttle` gets the
 * relay's own 429, which carries no Retry-After, once it has had `after` good pages; with
 * `monthSpent` the 429 also reports 0 requests remaining, which is the month, not the minute.
 */
function relay(throttle: string[] = [], opts: { after?: number; monthSpent?: boolean } = {}) {
  const calls: URL[] = [];
  const served = new Map<string, number>();
  const fetchImpl = (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    const company = url.searchParams.get("company") ?? "";
    if (throttle.includes(company) && (served.get(company) ?? 0) >= (opts.after ?? 0)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            message: opts.monthSpent
              ? "You have exceeded the MONTHLY quota for Requests on your current plan, BASIC"
              : "You have exceeded the rate limit per minute for your plan, BASIC, by the API provider",
          }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              ...(opts.monthSpent
                ? { "x-ratelimit-requests-limit": "100", "x-ratelimit-requests-remaining": "0" }
                : {}),
            },
          },
        ),
      );
    }
    served.set(company, (served.get(company) ?? 0) + 1);
    return Promise.resolve(
      new Response(JSON.stringify({ data: [], has_more: true, next_cursor: `page-${calls.length}` }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-ratelimit-requests-limit": "100",
          "x-ratelimit-requests-remaining": "80",
        },
      }),
    );
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

const sailingScope = (company: string, maxRequests: number, extra: _Payload = {}) => ({
  id: `scope-${company}`,
  label: `sailings:${company}:caribbean`,
  endpoint: "cruises",
  priority: 100,
  company,
  locale: "en_US",
  destination: "Caribbean",
  departure_within_days: 548,
  departure_offset_days: 90,
  sort: "departure_date:asc",
  min_interval_days: 6,
  last_run_at: null,
  max_rows_per_request: 10,
  max_requests_per_run: maxRequests,
  cursor: null,
  high_water_updated_at: null,
  ...extra,
});

const scopeUpdates = (writes: Write[], company: string) =>
  writes.filter((w) =>
    w.table === "cruise_sync_scope" && w.op === "update" && w.where?.id === `scope-${company}`
  );
const callsFor = (calls: URL[], company: string) =>
  calls.filter((u) => u.searchParams.get("company") === company).length;

Deno.test("a run starts no scope that would carry it past the per-minute cap, and leaves that scope due", async () => {
  const { db, writes } = fakeDb({
    scopes: [
      sailingScope("rc", 4),
      sailingScope("celebrity", 3),
      sailingScope("disney", 2),
      sailingScope("hal", 1),
    ],
  });
  const { fetchImpl, calls } = relay();

  const outcome = await runSync({ ...BASE, db, fetchImpl });

  // 4 + 3 = 7; disney's 2 would make 9, so the run stops there.
  assertEquals(calls.length, 7);
  assertEquals(callsFor(calls, "disney"), 0);
  // STOPS rather than skipping ahead: hal's 1 would fit, but running it would put a
  // lower-priority scope ahead of disney, and disney would lose the same way every week.
  assertEquals(callsFor(calls, "hal"), 0);
  // Deferred is not tried: no write to the scope, so it is still due for the next tick.
  assertEquals(scopeUpdates(writes, "disney").length, 0);
  assertEquals(scopeUpdates(writes, "celebrity")[0].payload.last_run_at, BASE.now.toISOString());
  assertEquals(outcome.status, "ok");
  assertEquals(closed(writes)?.payload.error_code, null);
  assertEquals(outcome.notes.some((n) => n.startsWith("deferred sailings:disney:caribbean")), true);
});

Deno.test("the first scope of a run always goes, so one sized above the cap is not deferred forever", async () => {
  const { db } = fakeDb({ scopes: [sailingScope("rc", 4), sailingScope("celebrity", 1)] });
  const { fetchImpl, calls } = relay();

  await runSync({ ...BASE, db, fetchImpl, maxRequestsPerRun: 3 });

  assertEquals(callsFor(calls, "rc"), 4);
  assertEquals(callsFor(calls, "celebrity"), 0);
});

Deno.test("a per-minute 429 stops the run and does NOT stamp the throttled scope as run", async () => {
  const { db, writes } = fakeDb({
    scopes: [sailingScope("rc", 2), sailingScope("celebrity", 2), sailingScope("disney", 2)],
  });
  const { fetchImpl, calls } = relay(["celebrity"]);

  const outcome = await runSync({ ...BASE, db, fetchImpl });

  // One attempt at celebrity, not three: a 429 with no Retry-After is not retried in-run.
  assertEquals(callsFor(calls, "rc"), 2);
  assertEquals(callsFor(calls, "celebrity"), 1);
  // Everything after it waits for the next tick instead of taking the same 429.
  assertEquals(callsFor(calls, "disney"), 0);
  assertEquals(scopeUpdates(writes, "disney").length, 0);

  // Stamping last_run_at would make it sit out a whole week having fetched nothing.
  const throttled = scopeUpdates(writes, "celebrity");
  assertEquals(throttled.length, 1);
  assertEquals("last_run_at" in throttled[0].payload, false);
  assertEquals(throttled[0].payload.last_status, "failed");

  assertEquals(outcome.status, "partial");
  assertEquals(closed(writes)?.payload.error_code, "rate_limited");
});

Deno.test("a sailing scope's window opens departure_offset_days out, not today", async () => {
  const { db } = fakeDb({
    scopes: [sailingScope("rc", 1), sailingScope("celebrity", 1, { departure_offset_days: 0 })],
  });
  const { fetchImpl, calls } = relay();

  await runSync({ ...BASE, db, fetchImpl });

  const after = (company: string) =>
    calls.find((u) => u.searchParams.get("company") === company)?.searchParams.get("departure_after");
  // BASE.now is 2026-09-28; 90 days on is 2026-12-27.
  assertEquals(after("rc"), "2026-12-27");
  assertEquals(after("celebrity"), "2026-09-28");
});

Deno.test("a sailing scope that ran earlier this Monday is not re-run by the next tick", async () => {
  // The gate that makes four ticks safe. Without it every tick re-spends every scope.
  const threeMinutesAgo = new Date(BASE.now.getTime() - 3 * 60_000).toISOString();
  const { db } = fakeDb({ scopes: [sailingScope("rc", 4, { last_run_at: threeMinutesAgo })] });
  const { fetchImpl, calls } = relay();

  const outcome = await runSync({ ...BASE, db, fetchImpl });

  assertEquals(calls.length, 0);
  assertEquals(outcome.status, "ok");
});

Deno.test("a 429 partway through a scope keeps the pages and the cursor it already bought", async () => {
  const { db, writes } = fakeDb({ scopes: [sailingScope("rc", 4), sailingScope("celebrity", 2)] });
  // Two good pages, then the per-minute limit.
  const { fetchImpl, calls } = relay(["rc"], { after: 2 });

  const outcome = await runSync({ ...BASE, db, fetchImpl });

  assertEquals(callsFor(calls, "rc"), 3);
  assertEquals(callsFor(calls, "celebrity"), 0);

  const rc = scopeUpdates(writes, "rc");
  assertEquals(rc.length, 1);
  // The second page's next_cursor: the next tick resumes after it, not from the start.
  assertEquals(rc[0].payload.cursor, "page-2");
  assertEquals("last_run_at" in rc[0].payload, false);
  assertEquals(outcome.status, "partial");
  assertEquals(closed(writes)?.payload.error_code, "rate_limited");
});

Deno.test("a 429 that says the MONTH is spent is not reported as the per-minute limit", async () => {
  const { db, writes } = fakeDb({ scopes: [sailingScope("rc", 2)] });
  const { fetchImpl } = relay(["rc"], { monthSpent: true });

  await runSync({ ...BASE, db, fetchImpl });

  assertEquals(closed(writes)?.payload.error_code === "rate_limited", false);
  // The month will not come back in a minute, so the scope is stamped as tried.
  assertEquals(scopeUpdates(writes, "rc")[0].payload.last_run_at, BASE.now.toISOString());
});

Deno.test("a tick steps aside while an earlier run is still going, and still closes its own row", async () => {
  const { db, writes } = fakeDb({ scopes: [sailingScope("rc", 4)], liveRun: true });
  const { fetchImpl, calls } = relay();

  const outcome = await runSync({ ...BASE, db, fetchImpl });

  assertEquals(calls.length, 0);
  assertEquals(outcome.status, "skipped");
  // The watchdog matches a dispatch to a run row; a skipped tick must still leave one.
  assertExists(opened(writes));
  assertEquals(closed(writes)?.payload.error_code, "previous_run_running");
});
