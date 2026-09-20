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
 *   * a trip that is not this agent's, or does not exist — one answer for both, 404, so trip
 *     ids cannot be enumerated
 *   * a status outside the `trip_status` enum
 *   * a write whose `expectedVersion` no longer matches — 409, not 400: the agent did nothing
 *     wrong, the row moved under them
 *   * `cancelled` with no reason — the client's §2.2.10 screen renders that reason, and a
 *     cancellation that cannot say why is a worse row than no cancellation
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
import { agentDb, requireAgentId } from "../_shared/agent.ts";

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
    const agentId = requireAgentId(ctx);
    const payload = await readJson(req);
    const db = agentDb();

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
    // into a last-write-wins.
    const expectedVersion = payload.expectedVersion;
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
      throw badRequest("Send the expectedVersion the board was rendered from.");
    }

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

    // Asking for the stage it is already in. No transition, so no history row and no audit
    // row — writing either would put a transition in the record that did not happen.
    if (result.outcome === "noop") {
      return json({
        tripId,
        status: result.to_status,
        version: result.version,
        changed: false,
      });
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

    return json({
      tripId,
      status: result.to_status,
      previousStatus: result.from_status,
      version: result.version,
      changed: true,
    });
  } catch (err) {
    return problem(err);
  }
});
