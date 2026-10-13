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
 * WHAT IT DOES NOT DO: it does not create commission, touch payment milestones, or touch the
 * proposal. Marking a trip `booked` is what §3.7's commission entry hangs off, but creating
 * that row is §3.7.4's job and doing it here would mean a stage change silently minting money
 * records.
 *
 * THE ONE COMMISSION WRITE IT MAKES IS ASKED FOR, never inferred (§3.7 Stage 5; Gyasi,
 * 2026-10-12). A cancellation may name the trip's open ledger lines the dialog listed under
 * "Mark these as Lost", each at the version it showed. A cancellation that names lines goes
 * through `agent_cancel_trip`, which calls `agent_set_trip_status` unchanged and then closes
 * exactly those lines that are still Expected or Invoiced, auditing each in the same
 * transaction (the commission rule: a change and its audit row land together). Nothing
 * named takes the path every cancel took before, `agent_set_trip_status` itself: an
 * unchecked box, or a caller that predates the list, cannot be broken by a function deployed
 * ahead of its migration (found in review).
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent, writeAuditEvents } from "../_shared/audit.ts";
import { readCloseLines } from "../_shared/commission.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { isRefundStatus, readJson, REFUND_STATUSES } from "../_shared/trip.ts";
import {
  agentDb,
  requireAgentId,
  requireExpectedVersion,
  stageWriteBody,
  type StageWriteResult,
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

// The SQL function refuses more than this too, and says so there. Checked here as well so
// an oversized request comes back in English rather than as a 500.
const MAX_BULK = 100;

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

    // ── §3.4.1's bulk status change ───────────────────────────────────────
    //
    // AN OP RATHER THAN A SECOND FUNCTION, and it defaults to the single-trip path so every
    // existing caller — the board's drag, the detail screen's StageMenu — is untouched by
    // this. One door onto trip status writes is one place to keep the audit honest.
    //
    // THE GUARD IS PER TRIP, which is where this stops resembling §3.3's bulk tag. Adding a
    // tag is set-valued and cannot clobber; setting a status overwrites. So the caller sends
    // the status each row was SHOWING, and a trip somebody else has moved since the page
    // rendered is skipped rather than overwritten. See the SQL function's header.
    if (payload.op === "bulk") {
      if (!Array.isArray(payload.trips)) throw badRequest("trips must be a list.");
      if (payload.trips.length === 0) throw badRequest("Pick at least one trip.");
      if (payload.trips.length > MAX_BULK) throw badRequest("That is too many trips.");

      const toStatus = payload.status;
      if (!isStatus(toStatus)) {
        throw badRequest(`Send a status of ${STATUSES.join(", ")}.`);
      }
      // Refused here as well as in SQL, so the advisor gets a sentence rather than a 500 off
      // a RAISE. §3.4.16 owns cancelling: it has an impact list and a mandatory reason, and
      // neither survives a checkbox column.
      if (toStatus === "cancelled") {
        throw badRequest(
          "Cancelling a trip is one at a time — it needs a reason and the impact review.",
        );
      }

      const ids: string[] = [];
      const froms: string[] = [];
      for (const raw of payload.trips) {
        const entry = raw as Record<string, unknown>;
        if (typeof entry?.tripId !== "string" || !isUuid(entry.tripId)) {
          throw badRequest("That is not a trip id.");
        }
        if (!isStatus(entry.fromStatus)) {
          throw badRequest("Each trip needs the status it was showing.");
        }
        ids.push(entry.tripId);
        froms.push(entry.fromStatus);
      }

      const { data, error } = await db.rpc("agent_bulk_set_trip_status", {
        p_trip_ids: ids,
        p_from_statuses: froms as never,
        p_agent_id: agentId,
        p_actor_user_id: ctx.platformUserId,
        p_to_status: toStatus,
      });
      if (error) throw new Error(`bulk trip status failed: ${error.message}`);

      // One row per trip that ACTUALLY moved. The ones missing are a mix of "not yours",
      // "already there" and "somebody moved it first" — deliberately indistinguishable, so
      // the answer cannot be used to probe for an id.
      const moved = (data ?? []) as
        { trip_id: string; from_status: string; version: number }[];

      await writeAuditEvents(ctx, moved.map((row) => ({
        eventType: "trip.status_changed",
        targetEntity: "trip",
        targetId: row.trip_id,
        metadata: {
          from: row.from_status,
          to: toStatus,
          version: row.version,
          bulk: true,
        },
      })));

      return json({
        outcome: "moved",
        status: toStatus,
        movedCount: moved.length,
        requestedCount: ids.length,
      });
    }

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

    // §3.4.16's two refund fields. UNLIKE the reason, neither is mandatory: an advisor who
    // does not yet know where the refund stands should not be blocked from recording the
    // cancellation, and NULL means "not stated" — which the column comment is explicit is a
    // different fact from `none_expected`.
    const refundStatus = payload.refundStatus;
    if (refundStatus !== undefined && !isRefundStatus(refundStatus)) {
      throw badRequest(
        `refundStatus must be one of ${REFUND_STATUSES.join(", ")}.`,
      );
    }
    const refundDetail = payload.refundDetail;
    if (refundDetail !== undefined && typeof refundDetail !== "string") {
      throw badRequest("refundDetail must be text.");
    }
    // Refund fields are facts about a cancellation. Accepting them on a move to `booked`
    // would write them to a trip that is not cancelled, where nothing renders them and
    // nothing would ever clear them.
    if (status !== "cancelled" && (refundStatus !== undefined || refundDetail !== undefined)) {
      throw badRequest("Refund details belong to a cancellation.");
    }

    // The ledger lines to mark Lost (§3.7 Stage 5). Same reasoning as the refund fields: they
    // are facts about a cancellation, and only a cancellation may name any.
    const closeLines = readCloseLines(payload.closeCommission);
    if (status !== "cancelled" && closeLines.length > 0) {
      throw badRequest("Closing commission lines belongs to a cancellation.");
    }

    // `undefined`, not `null`: p_reason has a SQL DEFAULT, so the generated Args type
    // makes it optional rather than nullable. Passing null is a type error, and
    // omitting it is what lets the function's own DEFAULT apply. Same for the two below.
    const reasonArg = typeof reason === "string" ? reason.trim() : undefined;
    const refundDetailArg = typeof refundDetail === "string"
      ? (refundDetail.trim() === "" ? undefined : refundDetail.trim())
      : undefined;

    let result: (StageWriteResult & { lines_closed?: number; lines_skipped?: number }) | undefined;
    if (status === "cancelled" && closeLines.length > 0) {
      const { data, error } = await db.rpc("agent_cancel_trip", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_actor_user_id: ctx.platformUserId,
        p_expected_version: expectedVersion,
        // Checked non-blank above for every `cancelled` call.
        p_reason: reasonArg ?? "",
        p_refund_status: refundStatus,
        p_refund_detail: refundDetailArg,
        p_close_lines: closeLines,
        // One v7 per line (Data-Model §21.6): the SQL pairs them with the lines in id order.
        p_audit_ids: closeLines.map(() => uuidV7()),
        p_ip: ctx.ip ?? undefined,
        p_user_agent: ctx.userAgent ?? undefined,
      });
      if (error) throw new Error(`trip cancel failed: ${error.message}`);
      result = Array.isArray(data) ? data[0] : data;
    } else {
      const { data, error } = await db.rpc("agent_set_trip_status", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_actor_user_id: ctx.platformUserId,
        p_status: status,
        p_expected_version: expectedVersion,
        p_reason: reasonArg,
        p_refund_status: refundStatus,
        p_refund_detail: refundDetailArg,
      });
      if (error) throw new Error(`trip status write failed: ${error.message}`);
      result = Array.isArray(data) ? data[0] : data;
    }

    // Zero rows is the function's answer for both "no such trip" and "not yours" — the same
    // 404 the traveler side gives, for the same reason.
    if (!result) throw notFound("No such trip.");

    // What happened to the lines, on every cancellation's answer: the dialog says it out loud.
    // `skipped` is a line that moved since the dialog opened (paid, edited, removed), left as is.
    const commission = status === "cancelled"
      ? {
        commissionLinesClosed: result.lines_closed ?? 0,
        commissionLinesSkipped: result.lines_skipped ?? 0,
      }
      : {};

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
          // The event type still says `reason`, which is now narrower than the event: this
          // outcome covers any cancellation detail moving without a transition. Left alone
          // rather than renamed, because an audit log that calls one concept two things
          // across a deploy boundary is worse than one whose name is a little old.
          refundStatus: refundStatus ?? null,
          refundDetail: typeof refundDetail === "string" ? refundDetail.trim() : null,
          // The lines themselves are audited one by one, in SQL; this is the trip's view.
          commissionLinesClosed: result.lines_closed ?? 0,
        },
      });

      return json({ ...stageWriteBody(tripId, status, result), ...commission });
    }

    // Asking for the stage it is already in, with no trip detail to write. No transition, so
    // no history row and no trip audit row — writing either would put a transition in the
    // record that did not happen. Lines closed from an already-cancelled trip's dialog WERE
    // written, and each has its own commission audit row from the SQL.
    if (result.outcome === "noop") {
      return json({ ...stageWriteBody(tripId, status, result), ...commission });
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
          ? { cancellationReason: reason.trim(), commissionLinesClosed: result.lines_closed ?? 0 }
          : {}),
      },
    });

    return json({ ...stageWriteBody(tripId, status, result), ...commission });
  } catch (err) {
    return problem(err);
  }
});
