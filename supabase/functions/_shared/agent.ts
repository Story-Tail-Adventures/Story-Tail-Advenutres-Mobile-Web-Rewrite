/**
 * The agent side's counterpart to `_shared/trip.ts`.
 *
 * §3.x routes are the first in this codebase that serve an agent rather than a traveler, and
 * the two sides need the same two guarantees in mirror image: the caller is who they claim to
 * be, and the row they named is theirs.
 */
import type { AuthContext } from "./auth.ts";
import { serviceClient, type Db } from "./db.ts";
import { badRequest, forbidden } from "./problem.ts";

/**
 * The caller's agent id, or 403. A traveler has none and does not belong on these routes.
 *
 * WHY THIS EXISTS RATHER THAN `requireRole(ctx, "agent")`, which would look equivalent:
 * `requireRole` only checks membership in a list. For `role = 'agent'` the platform_user
 * CHECK guarantees a non-null agent_id, so today the two are the same — but the CHECK's third
 * branch is a bare `(role = 'admin')`, so the moment anyone writes
 * `requireRole(ctx, "agent", "admin")` an admin with `agentId === null` walks through and the
 * null flows into a query as `undefined`. Returning the id, and refusing when there isn't
 * one, closes that by construction. Exactly the shape of `requireClientId`.
 *
 * WHY IT TAKES A `Db` AND READS A ROW, which a role check should not have to do:
 * `platform_user` says WHO the caller is; `public.agent` says whether that advisor is still
 * with the agency. Archiving an advisor writes `agent.status = 'archived'` and touches
 * nothing else — not auth.users, not account, not platform_user — so a context built from
 * platform_user alone cannot see it. Every READ on this side already does:
 * `current_agent_id()` joins `public.agent` and tests `a.status <> 'archived'`
 * (agent_read_surface.sql:71). Without the same test here, an offboarded advisor keeps full
 * write access to trips they can no longer see — an empty board that looks like enforcement,
 * next to an open door. That is worse than no offboarding at all.
 *
 * `<> 'archived'`, NOT `= 'active'`, deliberately, matching the read surface predicate word
 * for word. `inactive` is a paused advisor who must still work their own book; locking them
 * out is a support incident, not a security control. `archived` is the terminal state.
 *
 * The two must agree. If one moves, move both.
 */
export async function requireAgentId(ctx: AuthContext, db: Db): Promise<string> {
  if (ctx.role !== "agent" || !ctx.agentId) {
    throw forbidden("This is the advisor's side of the platform.");
  }

  // serviceClient (see `agentDb`): `public.agent` has no self-read policy for the agent
  // role, and an offboarding check that an archived advisor's own RLS could influence
  // would not be a check.
  const { data, error } = await db
    .from("agent")
    .select("status")
    .eq("id", ctx.agentId)
    .maybeSingle();

  // A failed lookup is OUR failure, not theirs: a 500 through `problem()`, never a quiet
  // pass. Failing open here would restore exactly the hole this read closes.
  if (error) {
    throw new Error(`Could not resolve the advisor record: ${error.message}`);
  }
  if (!data || data.status === "archived") {
    throw forbidden("This advisor account is closed.");
  }

  return ctx.agentId;
}

/**
 * The service-role client these routes run on.
 *
 * Named rather than calling `serviceClient()` inline, for the reason `tripDb()` gives: it is
 * the single place to look when asking "what privileges does this route actually run with".
 * And it is worth restating what the answer means — on the service role RLS checks nothing,
 * so every ownership test on this side is explicit, in SQL or in TypeScript, never inherited.
 */
export function agentDb(): Db {
  return serviceClient();
}

/**
 * The `expectedVersion` a board sends back, or a 400.
 *
 * Here rather than inline in the route because the RANGE is the part that is easy to forget
 * and expensive to get wrong, and the next agent write that honours `trip.version` needs the
 * same three tests.
 *
 * `Number.isInteger` alone is not enough. `p_expected_version` is `integer` in SQL, so a
 * number that is whole but larger than int4 passes the type test in TypeScript, fails the
 * cast inside Postgres (SQLSTATE 22003), and reaches the caller as a bodyless 500 — a server
 * error for what is a malformed request. `_shared/trip.ts` makes the same trade for trip ids,
 * checking the uuid SHAPE first "so a malformed id is a 400 rather than reaching Postgres and
 * coming back as an opaque 500".
 *
 * The floor is 1, not 0: `trip.version` is `NOT NULL DEFAULT 1` and only ever climbs, so no
 * board has ever rendered a 0 or a negative. This does not soften the 409 — a version that is
 * merely STALE is a real version, at least 1, and still goes through to the concurrency check
 * where it belongs.
 */
export function requireExpectedVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  ) {
    throw badRequest("Send the expectedVersion the board was rendered from.");
  }
  return value;
}

/** What `agent_set_trip_status` answers with, narrowed to what the response needs. */
export interface StageWriteResult {
  outcome: string;
  from_status: string;
  to_status: string;
  version: number;
}

/**
 * Every outcome `agent_set_trip_status` is known to return.
 *
 * A Set rather than a chain of `!==`, because the membership test is the load-bearing part:
 * see the throw in `stageWriteBody` for why an outcome that is NOT in here must never reach
 * a response body. `stale` is absent on purpose — the route turns it into a 409 before any
 * body is built, so it never arrives here.
 */
const KNOWN_OUTCOMES = new Set(["changed", "reason_changed", "noop"]);

/**
 * The 200 body for a stage write, which has three truthful shapes rather than two.
 *
 *   * `changed` — the stage moved. `previousStatus` says where from.
 *   * `reason_changed` — the stage did NOT move, but a cancelled trip's reason was
 *     corrected. `changed` stays false, because no stage moved and no history row was
 *     written. This endpoint is the only writer of `trip.cancellation_reason` in the
 *     schema; answering a flat 200 while dropping the reason left the traveler reading the
 *     old sentence with no way for the advisor to fix it.
 *   * `noop` — nothing to do.
 *
 * `previousStatus` is absent from both no-write shapes for the reason the contract already
 * gives: nothing was left behind.
 *
 * `cancellationReasonUpdated` IS PRESENT ON EVERY `cancelled` CALL AND ONLY THOSE, and it
 * answers one question — did the sentence the caller was forced to supply reach
 * `trip.cancellation_reason`? True on `changed`, because the UPDATE's CASE writes the reason
 * on any transition INTO `cancelled`; true on `reason_changed`, which is that write and
 * nothing else; false on `noop`, meaning the stored reason already read that way so there
 * was nothing to write. Either answer means the traveler now sees the caller's sentence on
 * §2.2.10.
 *
 * It was previously absent from the `changed` shape, which is the one call where the reason
 * definitely WAS written — a client testing `if (cancelled && !cancellationReasonUpdated)`
 * warned "your reason was not saved" on exactly the call that saved it, because `undefined`
 * is falsy. Keying presence on the REQUESTED status rather than the outcome is what closes
 * that: a cancel call always gets an answer. Non-cancel calls carry no reason, so inventing
 * a `false` for them would read as "your reason was dropped" on a call that never had one.
 *
 * `reason_changed` is only ever returned for a `cancelled` request — the migration's
 * same-stage branch is guarded by `p_status = 'cancelled'` — so keying on the requested
 * status loses no case.
 *
 * AN OUTCOME THIS FUNCTION DOES NOT KNOW IS A THROW, not a `changed: false`. The three
 * shapes above are exhaustive against today's migration, so a fourth string means the SQL
 * moved and this layer did not — a deploy-order bug, and the one thing that must not be
 * absorbed quietly. The route writes a `trip.status_changed` audit row for anything that
 * reaches its fall-through, so reporting "nothing happened" here would leave the audit log
 * and the response describing different events with no error anywhere. A plain `Error`
 * becomes a bodyless 500 through `problem()` with the outcome in the function log, which is
 * the honest answer: the failure is ours. The route refuses the same case a step earlier, so
 * no audit row is written before this throw; this one guards every other consumer.
 */
export function stageWriteBody(
  tripId: string,
  requestedStatus: string,
  result: StageWriteResult,
): Record<string, unknown> {
  if (!KNOWN_OUTCOMES.has(result.outcome)) {
    throw new Error(
      `unhandled agent_set_trip_status outcome: ${result.outcome}`,
    );
  }

  // `noop` is the only shape that wrote nothing; the other two both landed the reason.
  const reasonFlag = requestedStatus === "cancelled"
    ? { cancellationReasonUpdated: result.outcome !== "noop" }
    : {};

  if (result.outcome === "changed") {
    return {
      tripId,
      status: result.to_status,
      previousStatus: result.from_status,
      version: result.version,
      changed: true,
      ...reasonFlag,
    };
  }

  return {
    tripId,
    status: result.to_status,
    version: result.version,
    changed: false,
    ...reasonFlag,
  };
}
