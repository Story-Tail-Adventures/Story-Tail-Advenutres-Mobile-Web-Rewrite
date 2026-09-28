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

type Write = { table: string; op: "insert" | "update" | "upsert"; payload:_Payload };
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

    const result = () => {
      if (table === "cruise_api_request" && op === "select") {
        return head
          ? { count: script.ledgerSpent ?? 0, error: null, data: null }
          : { data: script.latestQuota ?? null, error: null, count: null };
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
        writes.push({ table, op: "insert", payload });
        return self;
      },
      update(payload: _Payload) {
        op = "update";
        writes.push({ table, op: "update", payload });
        return self;
      },
      upsert(payload: _Payload) {
        op = "upsert";
        writes.push({ table, op: "upsert", payload });
        return self;
      },
      eq: () => self,
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
