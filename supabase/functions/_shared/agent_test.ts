import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@^1";
import { HttpError } from "./problem.ts";
import { requireAgentId, requireExpectedVersion, stageWriteBody } from "./agent.ts";
import type { AuthContext } from "./auth.ts";
import type { Db } from "./db.ts";

/**
 * `requireAgentId` is two refusals, and it is tested because of what each one is guarding
 * against rather than because of what it does.
 *
 * THE ROLE REFUSAL. The obvious way to write the agent routes' gate is
 * `requireRole(ctx, "agent")`, which is what the new-edge-function skill's template reaches
 * for. It is equivalent TODAY. It stops being equivalent the moment anyone widens it to
 * `requireRole(ctx, "agent", "admin")`, because `platform_user`'s CHECK has a bare
 * `(role = 'admin')` branch — an admin row may legally carry no agent_id at all, or someone
 * else's. `requireRole` would wave that caller through and `ctx.agentId` would reach a query
 * as `undefined`. The admin cases below are therefore the point of the file. They are not
 * hypothetical: the same hole exists in the database and `current_agent_id()` closes it with
 * the same test, asserted in supabase/tests/rls_agent_reads.sql.
 *
 * THE ARCHIVED REFUSAL. An AuthContext is built from `platform_user`, and archiving an
 * advisor writes `agent.status` and nothing else — so the context cannot see it. Every read
 * on this side does (`current_agent_id()` tests `a.status <> 'archived'`), and a write path
 * that does not leaves an offboarded advisor moving trips they can no longer see. The status
 * cases below pin the predicate to `<> 'archived'` rather than `= 'active'`, because an
 * `inactive` advisor is paused, not gone, and must keep working their own book.
 *
 * Run: deno test --allow-env --config supabase/functions/deno.json supabase/functions/
 */

function ctx(overrides: Partial<AuthContext>): AuthContext {
  return {
    accountId: "0195a2c0-1a00-7000-8000-000000000010",
    platformUserId: "0195a2c0-1a00-7000-8000-000000000020",
    role: "agent",
    agentId: "0195a2c0-1a00-7000-8000-000000000001",
    clientId: null,
    aal: "aal1",
    secondFactorVerifiedAt: null,
    ip: null,
    userAgent: null,
    ...overrides,
  } as AuthContext;
}

interface Lookup {
  db: Db;
  /** Every `.from(...).select(...).eq(...)` the gate performed, in order. */
  calls: Array<{ table: string; columns: string; column: string; value: unknown }>;
}

/**
 * A `Db` that answers exactly the one query the gate makes, and records it.
 *
 * Hand-rolled rather than mocked: the shape under test is four chained calls and a row, and
 * recording the table and the filter is what lets a test assert the gate looked up the
 * CALLER'S agent rather than some other row.
 */
function lookup(
  result: { data: { status: string } | null; error: { message: string } | null },
): Lookup {
  const calls: Lookup["calls"] = [];
  const db = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, columns, column, value });
              return { maybeSingle: () => Promise.resolve(result) };
            },
          };
        },
      };
    },
  } as unknown as Db;
  return { db, calls };
}

const active = () => lookup({ data: { status: "active" }, error: null });

/** A `Db` that fails the test if the gate touches it at all. */
function unreachableDb(): Db {
  return {
    from() {
      throw new Error("the role refusal must come before any database read");
    },
  } as unknown as Db;
}

async function rejection(
  call: () => Promise<unknown>,
): Promise<{ status: number; detail: string }> {
  const error = await assertRejects(call, HttpError) as HttpError;
  return { status: error.status, detail: error.detail ?? "" };
}

Deno.test("an agent gets their agent id back", async () => {
  assertEquals(
    await requireAgentId(ctx({}), active().db),
    "0195a2c0-1a00-7000-8000-000000000001",
  );
});

Deno.test("the gate looks up the CALLER'S agent row, by id", async () => {
  const { db, calls } = active();
  await requireAgentId(ctx({}), db);
  assertEquals(calls, [{
    table: "agent",
    columns: "status",
    column: "id",
    value: "0195a2c0-1a00-7000-8000-000000000001",
  }]);
});

Deno.test("a client is refused", async () => {
  const { status } = await rejection(() =>
    requireAgentId(
      ctx({
        role: "client",
        agentId: null,
        clientId: "0195a2c0-1a00-7000-8000-000000000013",
      }),
      unreachableDb(),
    )
  );
  assertEquals(status, 403);
});

Deno.test("a client carrying a stray agent_id is still refused", async () => {
  // The role decides, not the column. A client row cannot legally hold an agent_id, but if
  // one ever did, the answer must not change.
  const { status } = await rejection(() =>
    requireAgentId(
      ctx({
        role: "client",
        agentId: "0195a2c0-1a00-7000-8000-000000000001",
        clientId: "0195a2c0-1a00-7000-8000-000000000013",
      }),
      unreachableDb(),
    )
  );
  assertEquals(status, 403);
});

Deno.test("an admin with no agent id is refused rather than passed through as undefined", async () => {
  const { status } = await rejection(() =>
    requireAgentId(ctx({ role: "admin", agentId: null, clientId: null }), unreachableDb())
  );
  assertEquals(status, 403);
});

Deno.test("an admin CARRYING an agent id is refused — this is the whole reason the helper exists", async () => {
  // platform_user's CHECK permits it. requireRole(ctx, "agent", "admin") would let this
  // caller act as whichever agent the row names.
  const { status } = await rejection(() =>
    requireAgentId(
      ctx({
        role: "admin",
        agentId: "0195a2c0-1a00-7000-8000-000000000001",
        clientId: null,
      }),
      unreachableDb(),
    )
  );
  assertEquals(status, 403);
});

Deno.test("the refusal names the side of the platform, not the role check", async () => {
  // The traveler side says "This is the traveler's side of the platform." An agent who
  // fat-fingers a URL should get the mirror sentence, not a bare 403.
  const { detail } = await rejection(() =>
    requireAgentId(ctx({ role: "client", agentId: null, clientId: "x" }), unreachableDb())
  );
  assertEquals(detail, "This is the advisor's side of the platform.");
});

Deno.test("an ARCHIVED advisor is refused — the write path agrees with every read", async () => {
  // current_agent_id() denies them their board, KPIs, inbox and calendar. Before this test
  // the same advisor could still move trips, which made the empty board look like an
  // offboarding that had worked.
  const { status, detail } = await rejection(() =>
    requireAgentId(ctx({}), lookup({ data: { status: "archived" }, error: null }).db)
  );
  assertEquals(status, 403);
  assertEquals(detail, "This advisor account is closed.");
});

Deno.test("an INACTIVE advisor is let through — paused is not offboarded", async () => {
  // The predicate is `<> 'archived'`, not `= 'active'`, word for word what the read surface
  // uses. Locking a paused advisor out of the book they already hold is a support incident,
  // not a security control.
  assertEquals(
    await requireAgentId(
      ctx({}),
      lookup({ data: { status: "inactive" }, error: null }).db,
    ),
    "0195a2c0-1a00-7000-8000-000000000001",
  );
});

Deno.test("an agent id with no agent row is refused, not assumed fine", async () => {
  const { status } = await rejection(() =>
    requireAgentId(ctx({}), lookup({ data: null, error: null }).db)
  );
  assertEquals(status, 403);
});

Deno.test("a failed lookup is a 500, never a quiet pass", async () => {
  // Fail-open here would restore the exact hole the read closes. A plain Error becomes a
  // bodyless 500 through problem(), which is the honest answer: the failure is ours.
  const error = await assertRejects(
    () => requireAgentId(ctx({}), lookup({ data: null, error: { message: "boom" } }).db),
    Error,
  );
  assertEquals(error instanceof HttpError, false);
});

// ── requireExpectedVersion ───────────────────────────────────────────────────────
//
// Optimistic concurrency's gatekeeper. The interesting cases are all on the boundary: the
// old guard tested `Number.isInteger` and nothing else, so a whole number too large for
// int4 passed here, failed the cast inside Postgres, and reached the agent as a 500.

function versionRejection(value: unknown): { status: number; detail: string } {
  try {
    requireExpectedVersion(value);
  } catch (error) {
    if (error instanceof HttpError) {
      return { status: error.status, detail: error.detail ?? "" };
    }
    throw error;
  }
  throw new Error(`expected ${JSON.stringify(value)} to be refused`);
}

Deno.test("a version the board rendered comes straight back", () => {
  assertEquals(requireExpectedVersion(1), 1);
  assertEquals(requireExpectedVersion(7), 7);
  assertEquals(requireExpectedVersion(2147483647), 2147483647);
});

Deno.test("a version too large for int4 is a 400, not a 500 from Postgres", () => {
  // This is the whole fix: 2147483648 and 1e20 are both integers by JavaScript's reckoning,
  // and both fail the cast to `integer` during argument coercion (SQLSTATE 22003), before
  // the function body runs. Caught here, they are a malformed request with a sentence.
  assertEquals(versionRejection(2147483648).status, 400);
  assertEquals(versionRejection(1e20).status, 400);
  assertEquals(versionRejection(Number.MAX_SAFE_INTEGER).status, 400);
});

Deno.test("zero and negatives are refused — no board ever rendered one", () => {
  // trip.version is NOT NULL DEFAULT 1 and only climbs.
  assertEquals(versionRejection(0).status, 400);
  assertEquals(versionRejection(-1).status, 400);
});

Deno.test("a STALE version still goes through to the 409 where it belongs", () => {
  // The range test must not swallow the case optimistic concurrency exists for: a version
  // that is real but out of date is >= 1, so it passes here and is refused in SQL.
  assertEquals(requireExpectedVersion(1), 1);
  assertEquals(requireExpectedVersion(99), 99);
});

Deno.test("non-numbers, fractions and NaN are refused with the sentence the board needs", () => {
  assertEquals(versionRejection(undefined).status, 400);
  assertEquals(versionRejection(null).status, 400);
  assertEquals(versionRejection("3").status, 400);
  assertEquals(versionRejection(1.5).status, 400);
  assertEquals(versionRejection(Number.NaN).status, 400);
  assertEquals(versionRejection(Number.POSITIVE_INFINITY).status, 400);
  assertEquals(
    versionRejection("3").detail,
    "Send the expectedVersion the board was rendered from.",
  );
});

// ── stageWriteBody ───────────────────────────────────────────────────────────────

const TRIP = "0195a2c0-1a00-7000-8000-000000000042";

Deno.test("a real transition says what it moved from", () => {
  assertEquals(
    stageWriteBody(TRIP, "booked", {
      outcome: "changed",
      from_status: "proposal",
      to_status: "booked",
      version: 2,
    }),
    {
      tripId: TRIP,
      status: "booked",
      previousStatus: "proposal",
      version: 2,
      changed: true,
    },
  );
});

Deno.test("a plain no-op reports no change and leaves previousStatus out", () => {
  assertEquals(
    stageWriteBody(TRIP, "proposal", {
      outcome: "noop",
      from_status: "proposal",
      to_status: "proposal",
      version: 1,
    }),
    { tripId: TRIP, status: "proposal", version: 1, changed: false },
  );
});

Deno.test("a corrected cancellation reason is reported, not swallowed", () => {
  // The defect this replaces: the same call that MAKES the reason mandatory accepted it,
  // answered a flat 200, and dropped it. `changed` is still false — no stage moved and no
  // history row was written — and the flag is what stops that reading as "nothing happened".
  assertEquals(
    stageWriteBody(TRIP, "cancelled", {
      outcome: "reason_changed",
      from_status: "cancelled",
      to_status: "cancelled",
      version: 4,
    }),
    {
      tripId: TRIP,
      status: "cancelled",
      version: 4,
      changed: false,
      cancellationReasonUpdated: true,
    },
  );
});

Deno.test("a cancel call that needed no write says so rather than staying silent", () => {
  // Every `cancelled` call carries a reason, because the route requires one. When the stored
  // reason already reads that way the honest answer is "nothing to write", said out loud.
  assertEquals(
    stageWriteBody(TRIP, "cancelled", {
      outcome: "noop",
      from_status: "cancelled",
      to_status: "cancelled",
      version: 4,
    }),
    {
      tripId: TRIP,
      status: "cancelled",
      version: 4,
      changed: false,
      cancellationReasonUpdated: false,
    },
  );
});

Deno.test("the reason flag appears only where a reason was in play", () => {
  // A no-op on a funnel stage has no reason to report on, and inventing `false` there would
  // read as "your reason was dropped" on a call that never carried one.
  const body = stageWriteBody(TRIP, "in_progress", {
    outcome: "noop",
    from_status: "in_progress",
    to_status: "in_progress",
    version: 6,
  });
  assertEquals("cancellationReasonUpdated" in body, false);
});

Deno.test("a real cancellation reports its reason landed — the call where it definitely did", () => {
  // The flag used to be absent here, because the `changed` branch returned before the flag
  // logic ran. A transition INTO `cancelled` is the one call where the reason is certainly
  // written: the route makes it mandatory and the migration's UPDATE sets
  // `cancellation_reason = coalesce(p_reason, cancellation_reason)`. A client testing
  // `if (cancelled && !cancellationReasonUpdated)` therefore warned "your reason was not
  // saved" on exactly the call that saved it, because `undefined` is falsy.
  //
  // CAN FAIL: change `result.outcome !== "noop"` in stageWriteBody to `===` — one character,
  // `!` to `=` — and this comes back false.
  assertEquals(
    stageWriteBody(TRIP, "cancelled", {
      outcome: "changed",
      from_status: "proposal",
      to_status: "cancelled",
      version: 3,
    }),
    {
      tripId: TRIP,
      status: "cancelled",
      previousStatus: "proposal",
      version: 3,
      changed: true,
      cancellationReasonUpdated: true,
    },
  );
});

Deno.test("an outcome the helper does not know throws rather than reporting no change", () => {
  // The three shapes are exhaustive against today's migration, so a fourth string means the
  // SQL grew an outcome and this layer did not — a deploy-order bug. Reporting it as
  // `changed: false` is the worst available answer: the route has already decided the write
  // happened, so the audit log would say `trip.status_changed` while the response said
  // nothing did. A plain Error is a bodyless 500 with the outcome in the function log.
  //
  // CAN FAIL: delete the `!` in `if (!KNOWN_OUTCOMES.has(result.outcome))` — one character —
  // and an unknown outcome falls through to a body instead of throwing.
  const error = assertThrows(
    () =>
      stageWriteBody(TRIP, "booked", {
        outcome: "reopened",
        from_status: "cancelled",
        to_status: "booked",
        version: 9,
      }),
    Error,
  );
  // Not an HttpError: the caller did nothing wrong, so this is a 500 and not a 4xx.
  assertEquals(error instanceof HttpError, false);
  assertEquals(
    error.message,
    "unhandled agent_set_trip_status outcome: reopened",
  );
});
