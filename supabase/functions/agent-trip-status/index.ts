/**
 * Move a trip between pipeline stages. Screen 3.2.2 (Pipeline / Funnel View).
 *
 * THE FIRST WRITE ON THE AGENT SIDE, and the first writer of `trip` anywhere in the codebase
 * — every mutation before this one belonged to a traveler.
 *
 * WHY THE MUTATION ITSELF IS IN SQL. A stage change is a trip update plus a
 * `trip_status_history` row, and those must both happen or neither. supabase-js has no
 * transaction across calls, and losing the history row is unrecoverable: Data-Model §8.8
 * exists precisely because `trip.status_changed_at` keeps only the latest transition, so a
 * transition without its history row leaves nothing to reconstruct the timing from and the
 * inquiry-to-book KPI is quietly wrong forever. `agent_set_trip_status` does the pair in one
 * statement, under `FOR UPDATE`. This function does auth, validation, and the audit row.
 *
 * WHY THE AUDIT ROW STAYS HERE. It carries `ip_address` and `user_agent`, which only exist at
 * the HTTP layer, and every other mutation in the codebase writes it through
 * `_shared/audit.ts`. Two audit paths would be worse than the narrow window where a stage
 * change commits and its audit row does not — that window is visible and recoverable; a lost
 * history row is neither.
 *
 * WHAT IT REFUSES, all explicit, because this runs on the service role and RLS checks nothing:
 *   * a caller who is not an agent — 403 with a sentence
 *   * an agent whose `agent.status` is `archived` — 403, the same predicate every read on
 *     this side already applies; see `requireAgentId`
 *   * a trip that is not this agent's, or does not exist — one answer for both, 404, so trip
 *     ids cannot be enumerated
 *   * a status outside the `trip_status` enum
 *   * an `expectedVersion` that is not a version a board could have rendered — 400, before
 *     Postgres sees it
 *   * a write whose `expectedVersion` no longer matches — 409, not 400: the agent did nothing
 *     wrong, the row moved under them
 *   * `cancelled` with no reason — the client's §2.2.10 screen renders that reason, and a
 *     cancellation that cannot say why is a worse row than no cancellation
 *
 * ASKING FOR THE STAGE A TRIP IS ALREADY IN is a 200 with `changed: false`, and writes
 * nothing — with one exception. `cancelled` → `cancelled` carrying a DIFFERENT reason is a
 * real correction: this endpoint is the only writer of `trip.cancellation_reason` anywhere
 * in the schema, and the same call that makes the reason mandatory used to accept it, answer
 * 200, and drop it. The reason now lands, an audit row is written under its own event type,
 * and `changed` stays false because no stage moved.
 *
 * EVERY `cancelled` CALL GETS A `cancellationReasonUpdated`, whether or not the stage moved,
 * because the reason is mandatory on all of them and the caller is owed a straight answer
 * about where it went. True means this call wrote it, false means the stored reason already
 * read that way. See `stageWriteBody`.
 *
 * WHAT IT DOES NOT DO: it does not touch commission, payment milestones, or the proposal.
 * Marking a trip `booked` is what §3.7's commission entry hangs off, but creating that row is
 * §3.7.4's job and doing it here would mean a stage change silently minting money records.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import {
  agentDb,
  requireAgentId,
  requireExpectedVersion,
  stageWriteBody,
} from "../_shared/agent.ts";

/**
 * The five stages the board offers, which is NOT the whole enum.
 *
 * `cancelled` is reachable — it is the sixth value and a real destination — but it is not a
 * funnel column; Screen Inventory §3.2.2 names five. The prototype draws `Qualified` and
 * `Traveling`, neither of which exists in `trip_status`; that divergence is recorded as a
 * prototype defect rather than chased with a migration.
 */
const STATUSES = [
  "inquiry",
  "proposal",
  "booked",
  "in_progress",
  "completed",
  "cancelled",
] as const;

type Status = (typeof STATUSES)[number];

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const db = agentDb();
    // Reads `public.agent`, so it is awaited and needs the client — archiving an advisor
    // writes agent.status and nothing else, and platform_user alone cannot see it.
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);

    const tripId = payload.tripId;
    if (typeof tripId !== "string" || !isUuid(tripId)) {
      throw badRequest("That is not a trip id.");
    }

    const status = payload.status;
    if (!isStatus(status)) {
      throw badRequest(`Send a status of ${STATUSES.join(", ")}.`);
    }

    // Required, not optional. The SQL function treats NULL as "no concurrency check" for a
    // future server-side caller, but a human dragging a card always has a version in hand —
    // it came down with the board — and letting the UI omit it would quietly turn every drop
    // into a last-write-wins. The range test lives with the helper, and is the reason it is
    // a helper: an over-range integer that reaches Postgres comes back as a 500.
    const expectedVersion = requireExpectedVersion(payload.expectedVersion);

    // A cancellation the traveler cannot be told the reason for is a worse row than no
    // cancellation: `trip.cancellation_reason` is inside the client column grant and §2.2.10
    // renders it.
    const reason = payload.cancellationReason;
    if (status === "cancelled" && (typeof reason !== "string" || reason.trim() === "")) {
      throw badRequest("A cancelled trip needs a reason — the traveler's screen shows it.");
    }
    if (reason !== undefined && typeof reason !== "string") {
      throw badRequest("cancellationReason must be text.");
    }

    const { data, error } = await db.rpc("agent_set_trip_status", {
      p_trip_id: tripId,
      p_agent_id: agentId,
      p_actor_user_id: ctx.platformUserId,
      p_status: status,
      p_expected_version: expectedVersion,
      // `undefined`, not `null`: p_reason has a SQL DEFAULT, so the generated Args type
      // makes it optional rather than nullable. Passing null is a type error, and
      // omitting it is what lets the function's own DEFAULT apply.
      p_reason: typeof reason === "string" ? reason.trim() : undefined,
    });

    if (error) throw new Error(`trip status write failed: ${error.message}`);

    // Zero rows is the function's answer for both "no such trip" and "not yours" — the same
    // 404 the traveler side gives, for the same reason.
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw notFound("No such trip.");

    if (result.outcome === "stale") {
      throw conflict(
        "This trip moved since the board was loaded. Reload and try again.",
      );
    }

    // Correcting the reason on a trip that is ALREADY cancelled. No transition, so no
    // history row — but a column did move, so it gets its own audit row under its own event
    // type rather than being logged as a status change that did not happen.
    // `trip.cancellation_reason` has exactly one writer in the whole schema, this endpoint,
    // so dropping it quietly left the traveler reading a reason nobody could correct.
    if (result.outcome === "reason_changed") {
      await writeAuditEvent(ctx, {
        eventType: "trip.cancellation_reason_changed",
        targetEntity: "trip",
        targetId: tripId,
        metadata: {
          status: result.to_status,
          version: result.version,
          cancellationReason: typeof reason === "string" ? reason.trim() : null,
        },
      });

      return json(stageWriteBody(tripId, status, result));
    }

    // Asking for the stage it is already in, with nothing else to write. No transition, so
    // no history row and no audit row — writing either would put a transition in the record
    // that did not happen.
    if (result.outcome === "noop") {
      return json(stageWriteBody(tripId, status, result));
    }

    // THE FALL-THROUGH IS `changed` AND NOTHING ELSE, tested before the audit row rather
    // than after it. `stale`, `reason_changed` and `noop` are handled above, so a fourth
    // string means the migration grew an outcome this route has not learned — a deploy-order
    // bug in the layer below, not a state to absorb. Reaching the audit write with one would
    // record a `trip.status_changed` for an event nobody here can name, and `stageWriteBody`
    // would then answer `changed: false`: the audit log and the response describing
    // different things, with no error anywhere. Refusing first means no audit row is written
    // at all, and the outcome reaches the function log through `problem()` as a bodyless 500.
    // `stageWriteBody` throws the same way for any other consumer of that RPC.
    if (result.outcome !== "changed") {
      throw new Error(
        `unhandled agent_set_trip_status outcome: ${result.outcome}`,
      );
    }

    await writeAuditEvent(ctx, {
      eventType: "trip.status_changed",
      targetEntity: "trip",
      targetId: tripId,
      metadata: {
        from: result.from_status,
        to: result.to_status,
        version: result.version,
        ...(status === "cancelled" && typeof reason === "string"
          ? { cancellationReason: reason.trim() }
          : {}),
      },
    });

    return json(stageWriteBody(tripId, status, result));
  } catch (err) {
    return problem(err);
  }
});
