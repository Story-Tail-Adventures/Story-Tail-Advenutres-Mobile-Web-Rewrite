/**
 * §3.4.14 Itinerary Editor's writes.
 *
 * ── ITS OWN DOOR, NOT FIVE MORE OPS ON `agent-trip` ──────────────────────────
 *
 * `agent-trip` is the trip's write door and it already carries seven ops over 500 lines —
 * create, three component verbs, three payment verbs. The itinerary is a different entity
 * graph (itinerary → day → activity), reached through a different screen, and
 * `agent-trip-status` and `agent-trip-notes` are already separate for the same reason. A
 * route is cheap; a 750-line dispatcher covering three entity families is not.
 *
 * ── THE GENERATOR IS THE INTERESTING ONE ─────────────────────────────────────
 *
 * `generate` is additive and idempotent by construction — see the migration. What matters
 * here is that it AUDITS WHAT IT DID rather than that it ran: an advisor pressing the
 * button twice produces one audit row, because the second press changed nothing.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import { readTime } from "../_shared/component.ts";

const OPS = [
  "generate",
  "day_upsert",
  "activity_upsert",
  "activity_delete",
  "reorder",
] as const;
type Op = (typeof OPS)[number];

/** `block_kind`, exactly. Omitted means "work it out from the time" — the SQL does. */
const BLOCKS = ["morning", "afternoon", "evening", "all_day"] as const;

const MAX_TITLE = 200;
const MAX_LABEL = 120;
const MAX_BODY = 4000;
const MAX_TIP = 2000;
const MAX_SHORT = 200;
/** One day's activities. Far past any real day and well under where the UPDATE would matter. */
const MAX_REORDER = 200;

/** Postgres's SQLSTATE for a bare `RAISE EXCEPTION`. */
const RAISE_EXCEPTION = "P0001";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !OPS.includes(value as Op)) {
    throw badRequest(`op must be one of ${OPS.join(", ")}.`);
  }
  return value as Op;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || !isUuid(value)) throw badRequest(`That is not a ${field}.`);
  return value;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireId(value, field);
}

function str(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw badRequest(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && trimmed === "") throw badRequest(`${field} is required.`);
  if (trimmed.length > max) throw badRequest(`${field} is too long.`);
  return trimmed === "" ? null : trimmed;
}

function isoDate(value: unknown, field: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} must be a date.`);
  }
  return value;
}

function block(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !(BLOCKS as readonly string[]).includes(value)) {
    throw badRequest(`block must be one of ${BLOCKS.join(", ")}.`);
  }
  return value;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const db = agentDb();
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);
    const op = requireOp(payload.op);
    const tripId = requireId(payload.tripId, "trip id");

    // ── Auto-generate ─────────────────────────────────────────────────────
    if (op === "generate") {
      const { data, error } = await db.rpc("agent_generate_itinerary", {
        p_trip_id: tripId,
        p_agent_id: agentId,
      });
      if (error) throw new Error(`itinerary generate failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      // Zero rows is "no such trip" and "not yours" alike, deliberately indistinguishable.
      if (!result) throw notFound("That trip is not on your board.");

      // `no_dates` IS A 200 WITH AN OUTCOME, not a 4xx: the screen needs to say "give the
      // trip dates first" against the dates rather than as a banner, and the transport
      // surfaces only `detail` on a rejection. Same call §3.4.3 makes for `no_client`.
      if (result.outcome === "generated") {
        await writeAuditEvent(ctx, {
          eventType: "itinerary.generated",
          targetEntity: "trip",
          targetId: tripId,
          // WHAT IT DID, not that it ran. A second press changes nothing and writes no
          // row, so the log reads as a history of the itinerary rather than of clicks.
          metadata: {
            days_added: result.days_added,
            activities_added: result.activities_added,
          },
        });
      }

      return json({
        outcome: result.outcome,
        daysAdded: result.days_added,
        activitiesAdded: result.activities_added,
      });
    }

    // ── A day ─────────────────────────────────────────────────────────────
    if (op === "day_upsert") {
      const dayId = optionalId(payload.dayId, "day id");

      const { data, error } = await db.rpc("agent_upsert_itinerary_day", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_day_id: dayId,
        // Required on a create and optional on an edit: the SQL keeps the existing date
        // when this is null, so an advisor editing only a label does not have to resend it.
        p_date: isoDate(payload.date, "Date", dayId === null),
        p_label: str(payload.label, "Label", MAX_LABEL),
        p_summary: str(payload.summary, "Summary", MAX_BODY),
      } as never);
      if (error) throw new Error(`itinerary day upsert failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      if (result.outcome !== "noop") {
        await writeAuditEvent(ctx, {
          eventType: dayId ? "itinerary_day.updated" : "itinerary_day.created",
          targetEntity: "itinerary_day",
          targetId: result.day_id,
          // No label or summary. Both are prose about a client's trip and an audit_event is
          // kept seven years; the shape and the link are the facts worth retaining.
          metadata: { trip_id: tripId },
        });
      }

      return json({ outcome: result.outcome, dayId: result.day_id });
    }

    // ── An activity ───────────────────────────────────────────────────────
    if (op === "activity_upsert") {
      const activityId = optionalId(payload.activityId, "activity id");
      const dayId = optionalId(payload.dayId, "day id");

      const { data, error } = await db.rpc("agent_upsert_itinerary_activity", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_activity_id: activityId,
        p_day_id: dayId,
        p_title: str(payload.title, "Title", MAX_TITLE, true) as string,
        p_block: block(payload.block),
        p_start_time: readTime(payload.startTime, "Start time"),
        p_end_time: readTime(payload.endTime, "End time"),
        p_body: str(payload.body, "Description", MAX_BODY),
        p_location: str(payload.location, "Place", MAX_SHORT),
        p_address: str(payload.address, "Address", MAX_SHORT),
        p_phone: str(payload.phone, "Phone", 40),
        p_confirmation_number: str(payload.confirmationNumber, "Confirmation number", 80),
        p_gyasis_tip: str(payload.gyasisTip, "Tip", MAX_TIP),
      } as never);
      if (error) throw new Error(`itinerary activity upsert failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      // Also the answer for "that day is not on this itinerary" and "no day given on a
      // create" — one response for every way the request does not fit.
      if (!result) throw notFound("That trip is not on your board.");

      if (result.outcome !== "noop") {
        await writeAuditEvent(ctx, {
          eventType: activityId ? "itinerary_activity.updated" : "itinerary_activity.created",
          targetEntity: "itinerary_activity",
          targetId: result.activity_id,
          metadata: { trip_id: tripId },
        });
      }

      return json({ outcome: result.outcome, activityId: result.activity_id });
    }

    if (op === "activity_delete") {
      const activityId = requireId(payload.activityId, "activity id");

      const { data, error } = await db.rpc("agent_delete_itinerary_activity", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_activity_id: activityId,
      });
      if (error) throw new Error(`itinerary activity delete failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      // A HARD DELETE, so the audit row is the only record left that it existed. Written
      // unconditionally for that reason — there is no `noop` here.
      await writeAuditEvent(ctx, {
        eventType: "itinerary_activity.deleted",
        targetEntity: "itinerary_activity",
        targetId: result.activity_id,
        metadata: { trip_id: tripId },
      });

      return json({ outcome: result.outcome, activityId: result.activity_id });
    }

    // ── Reorder one day ───────────────────────────────────────────────────
    const dayId = requireId(payload.dayId, "day id");
    const ids = payload.activityIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw badRequest("Send the activities in their new order.");
    }
    if (ids.length > MAX_REORDER) throw badRequest("That is too many activities.");
    const activityIds = ids.map((id) => requireId(id, "activity id"));
    // Checked here rather than left to the UPDATE's `WHERE a.id = pos.id`, which would
    // silently apply the first occurrence and leave an order nobody chose.
    if (new Set(activityIds).size !== activityIds.length) {
      throw badRequest("That order lists an activity twice.");
    }

    const { data, error } = await db.rpc("agent_reorder_itinerary_activities", {
      p_trip_id: tripId,
      p_agent_id: agentId,
      p_day_id: dayId,
      p_activity_ids: activityIds,
    });

    // THE FUNCTION REFUSES A PARTIAL DAY, and that is a 409 rather than a 500. It means the
    // day gained or lost an activity since this page rendered — a second tab, or the back
    // button — which is a stale write and nothing the advisor did wrong. 409 is the signal
    // `EdgeCallResult.conflict` already carries for exactly this.
    if (error) {
      if (error.code === RAISE_EXCEPTION) {
        throw conflict("This day changed since you opened it. Reload and try again.");
      }
      throw new Error(`itinerary reorder failed: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw notFound("That trip is not on your board.");

    if (result.moved > 0) {
      await writeAuditEvent(ctx, {
        eventType: "itinerary_day.reordered",
        targetEntity: "itinerary_day",
        targetId: dayId,
        metadata: { trip_id: tripId, moved: result.moved, total: activityIds.length },
      });
    }

    return json({ outcome: result.outcome, moved: result.moved });
  } catch (err) {
    return problem(err);
  }
});
