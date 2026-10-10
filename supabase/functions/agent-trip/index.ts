/**
 * The trip's own write door. Screens 3.4.3 (create) and 3.4.4 – 3.4.12 (components).
 *
 * ── A SEPARATE DOOR FROM `agent-trip-status` ─────────────────────────────────
 *
 * That function is about a trip's STAGE: it takes a version, refuses a stale write, and
 * writes a `trip_status_history` row for the transition. Nothing here is any of those —
 * creating a trip has no prior stage to move from, and a component is not the trip.
 * Folding either into it would mean ops that ignore every parameter it exists for.
 *
 * ── FOUR OPS, AND WHY COMPONENTS ARE NOT THEIR OWN FUNCTION ──────────────────
 *
 * §3.4.5 – §3.4.11 draw seven "add" sheets and §3.4.12 draws an "edit" — eight screens over
 * one table, differing only in which fields each FORM shows. The same reasoning that made
 * `agent_upsert_trip_component` one SQL function makes this one route: seven copies of one
 * ownership check, differing by which payload keys they happened to name, is not seven
 * functions' worth of anything.
 *
 * ── THE ID IS MINTED HERE ────────────────────────────────────────────────────
 *
 * For a trip: v7, client-side of the database, per Data-Model §21.6 — the callers that CAN
 * hand Postgres a time-ordered id do, and this one can. It also means the redirect target
 * is known before the write returns.
 *
 * NOT for a component. `agent_upsert_trip_component` mints its own and hands it back,
 * because `p_component_id` there means "edit this one" and nothing else — the two readings
 * collided once already and produced a primary-key violation on a crafted request.
 *
 * `trip` is not on CLAUDE.md rule 3's list the way `client` is, but a trip carries a
 * client's money and an advisor's commission, and every other write on this surface audits.
 * One less place to wonder about.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import {
  readCents,
  readCommissionPct,
  readComponentPayload,
  readTime,
  requireComponentKind,
  resolveCommissionCents,
} from "../_shared/component.ts";

const OPS = [
  "create",
  "component_upsert",
  "component_archive",
  "component_reorder",
  // §3.4.15. `payment_paid` is separate from `payment_upsert` for the reason the migration
  // gives: `paid_cents`, `paid_at` and `status` move together and they are the only thing
  // that may touch `trip.total_paid_cents`, which sizes the balance a traveler is shown
  // when they authorize a card. A label edit must not be able to reach it.
  "payment_upsert",
  "payment_paid",
  "payment_delete",
] as const;
type Op = (typeof OPS)[number];

/**
 * FIVE, matching `trip_type` exactly. The design prototype's `A343_NewTripType` draws SIX
 * tiles — it adds "Honeymoon", which is not a trip type anywhere in the schema. A honeymoon
 * is an all-inclusive or a custom trip; the same call §3.4's dining sheet got.
 */
const TRIP_TYPES = [
  "cruise",
  "all_inclusive",
  "multi_destination",
  "group",
  "custom",
] as const;
type TripType = (typeof TRIP_TYPES)[number];

const MAX_TITLE = 160;
const MAX_TRAVELERS = 64;
const MAX_COMPONENT_NAME = 200;
const MAX_LOCATION = 200;
const MAX_CONFIRMATION = 80;

/**
 * A reorder carries every live component of the trip, so the ceiling is really "how many
 * components can one trip hold". 500 is far past any real itinerary and well under the
 * point where the `unnest ... WITH ORDINALITY` update would be worth thinking about.
 */
const MAX_REORDER = 500;

const MILESTONE_KINDS = ["deposit", "interim", "final"] as const;
/**
 * All four, and `waived` is the one worth naming. Data-Model §9.5: suppliers do forgive
 * milestones, and a waived one is not a paid one — it must not raise what the client has
 * paid. `overdue` is stored rather than derived from `due_date < today` because an advisor
 * has to be able to suppress it when a supplier has verbally extended a deadline.
 */
const MILESTONE_STATUSES = ["scheduled", "paid", "waived", "overdue"] as const;

const MAX_MILESTONE_LABEL = 120;

/** Postgres's SQLSTATE for a bare `RAISE EXCEPTION`. */
const RAISE_EXCEPTION = "P0001";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function isTripType(value: unknown): value is TripType {
  return typeof value === "string" && (TRIP_TYPES as readonly string[]).includes(value);
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !OPS.includes(value as Op)) {
    throw badRequest(`op must be one of ${OPS.join(", ")}.`);
  }
  return value as Op;
}

function requireTripId(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) throw badRequest("That is not a trip id.");
  return value;
}

function requireComponentId(value: unknown): string {
  if (typeof value !== "string" || !isUuid(value)) {
    throw badRequest("That is not a component id.");
  }
  return value;
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

/** ISO `yyyy-mm-dd`, or null. Postgres would reject anything else — this says so in English. */
function isoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} must be a date.`);
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

    // ── 3.4.3 Create ──────────────────────────────────────────────────────
    if (op === "create") {
      const clientId = payload.clientId;
      if (typeof clientId !== "string" || !isUuid(clientId)) {
        throw badRequest("Pick a client for this trip.");
      }

      if (!isTripType(payload.tripType)) {
        throw badRequest(`Send a trip type of ${TRIP_TYPES.join(", ")}.`);
      }

      const rawTitle = str(payload.title, "Trip name", MAX_TITLE, true) as string;

      // Optional, and clamped rather than refused: a traveler count is a starting guess the
      // builder will correct, and bouncing the whole form over it would be pedantic.
      const travelers = Number.isInteger(payload.travelerCount)
        ? Math.min(Math.max(payload.travelerCount as number, 1), MAX_TRAVELERS)
        : 1;

      const tripId = uuidV7();

      const { data, error } = await db.rpc("agent_create_trip", {
        p_agent_id: agentId,
        p_trip_id: tripId,
        p_client_id: clientId,
        p_title: rawTitle,
        p_trip_type: payload.tripType,
        p_traveler_count: travelers,
      });
      if (error) throw new Error(`trip create failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That advisor cannot create trips.");

      // 200 with an outcome rather than a 4xx, the same call `agent-client` makes for a
      // duplicate email: the form needs to say "pick a client" against the right field, and
      // the transport surfaces only `detail` on a rejection.
      if (result.outcome === "no_client") {
        return json({ outcome: "no_client" });
      }

      await writeAuditEvent(ctx, {
        eventType: "trip.created",
        targetEntity: "trip",
        targetId: tripId,
        // No title. A trip name can carry a client's plans, and an audit_event is kept seven
        // years — the shape and the link are the facts worth retaining, the same line
        // `client.created` draws.
        metadata: {
          client_id: clientId,
          trip_type: payload.tripType,
          traveler_count: travelers,
        },
      });

      return json({ outcome: "created", tripId });
    }

    const tripId = requireTripId(payload.tripId);

    // ── 3.4.5 – 3.4.12 Add and edit a component ───────────────────────────
    if (op === "component_upsert") {
      const kind = requireComponentKind(payload.kind);
      // Present means EDIT. A create never sends one — see the header.
      const componentId = payload.componentId === undefined || payload.componentId === null
        ? null
        : requireComponentId(payload.componentId);

      const supplierId = payload.supplierId === undefined || payload.supplierId === null ||
          payload.supplierId === ""
        ? null
        : requireComponentId(payload.supplierId);

      const displayName = str(
        payload.displayName,
        "Name",
        MAX_COMPONENT_NAME,
        true,
      ) as string;

      const costCents = readCents(payload.costCents, "Cost");
      const commissionPct = readCommissionPct(payload.commissionPct);
      // Blank + a rate means "work it out"; anything typed, including 0, wins. See
      // `resolveCommissionCents` for why both columns exist and neither is the other.
      const commissionCents = resolveCommissionCents(
        costCents,
        commissionPct,
        payload.commissionCents,
      );

      const { data, error } = await db.rpc("agent_upsert_trip_component", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_component_id: componentId,
        p_kind: kind,
        p_display_name: displayName,
        p_supplier_id: supplierId,
        p_start_date: isoDate(payload.startDate, "Start date"),
        p_end_date: isoDate(payload.endDate, "End date"),
        p_start_time: readTime(payload.startTime, "Start time"),
        p_end_time: readTime(payload.endTime, "End time"),
        p_location: str(payload.location, "Place", MAX_LOCATION),
        p_confirmation_number: str(
          payload.confirmationNumber,
          "Confirmation number",
          MAX_CONFIRMATION,
        ),
        p_cost_cents: costCents,
        p_commission_pct: commissionPct,
        p_commission_cents: commissionCents,
        // NO CURRENCY. `agent_upsert_trip_component` takes the trip's, deliberately: one
        // trip, one currency, and the BEFORE trigger on trip_component would refuse anything
        // else anyway. Taking it here would invite a form to offer a choice that cannot be
        // honoured.
        p_payload: readComponentPayload(kind, payload.detail),
        // `as never` for the reason `agent-client` gives at its own three call sites:
        // `supabase gen types` cannot infer nullability from a `DEFAULT NULL` parameter, so
        // every optional arg is generated as `?: string` rather than `: string | null` and
        // the null this function must pass — for an unset date, an absent supplier, a create
        // with no component id — does not typecheck against its own schema.
      } as never);
      if (error) throw new Error(`component upsert failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      // Zero rows is "no such trip", "not your trip", and "that component is not on this
      // trip" — one answer for all three, so ids cannot be probed by the shape of the
      // rejection. Same line every accessor on this surface draws.
      if (!result) throw notFound("That trip is not on your board.");

      // `noop` writes no audit row, for the reason rule 3 exists: an audit log is a record
      // of what CHANGED, and a builder that auto-saves would otherwise fill it with rows
      // saying nothing happened.
      if (result.outcome !== "noop") {
        await writeAuditEvent(ctx, {
          eventType: componentId ? "trip_component.updated" : "trip_component.created",
          targetEntity: "trip_component",
          targetId: result.component_id,
          // Money, and no name. A component's display_name is the line a client reads on
          // the proposal and can carry their plans; the cost and the commission are the
          // financially material facts an audit is for.
          metadata: {
            trip_id: tripId,
            kind,
            cost_cents: String(costCents),
            commission_cents: String(commissionCents),
          },
        });
      }

      return json({ outcome: result.outcome, componentId: result.component_id });
    }

    // ── 3.4.12 Remove from trip ───────────────────────────────────────────
    if (op === "component_archive") {
      const componentId = requireComponentId(payload.componentId);

      const { data, error } = await db.rpc("agent_archive_trip_component", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_component_id: componentId,
      });
      if (error) throw new Error(`component archive failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      if (result.outcome !== "noop") {
        await writeAuditEvent(ctx, {
          eventType: "trip_component.archived",
          targetEntity: "trip_component",
          targetId: result.component_id,
          metadata: { trip_id: tripId },
        });
      }

      return json({ outcome: result.outcome, componentId: result.component_id });
    }

    // ── 3.4.15 The payment schedule ───────────────────────────────────────
    if (op === "payment_upsert") {
      const kind = payload.kind;
      if (typeof kind !== "string" || !(MILESTONE_KINDS as readonly string[]).includes(kind)) {
        throw badRequest(`kind must be one of ${MILESTONE_KINDS.join(", ")}.`);
      }

      const milestoneId = payload.milestoneId === undefined || payload.milestoneId === null
        ? null
        : requireComponentId(payload.milestoneId);

      const { data, error } = await db.rpc("agent_upsert_payment_milestone", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_milestone_id: milestoneId,
        p_kind: kind,
        p_label: str(payload.label, "Label", MAX_MILESTONE_LABEL, true) as string,
        p_amount_cents: readCents(payload.amountCents, "Amount"),
        p_due_date: isoDate(payload.dueDate, "Due date"),
      } as never);
      if (error) throw new Error(`milestone upsert failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      if (result.outcome !== "noop") {
        await writeAuditEvent(ctx, {
          eventType: milestoneId ? "payment_milestone.updated" : "payment_milestone.created",
          targetEntity: "payment_milestone",
          targetId: result.milestone_id,
          // No label — it is the client-facing sentence and can name their plans. The
          // amount is the financially material fact an audit is for.
          metadata: {
            trip_id: tripId,
            kind,
            amount_cents: String(readCents(payload.amountCents, "Amount")),
          },
        });
      }

      return json({ outcome: result.outcome, milestoneId: result.milestone_id });
    }

    if (op === "payment_paid") {
      const status = payload.status;
      if (
        typeof status !== "string" ||
        !(MILESTONE_STATUSES as readonly string[]).includes(status)
      ) {
        throw badRequest(`status must be one of ${MILESTONE_STATUSES.join(", ")}.`);
      }

      const milestoneId = requireComponentId(payload.milestoneId);
      // Absent means "the whole amount"; a number means a partial payment actually
      // arrived. Zero is NOT absent — it is an advisor recording that nothing landed.
      const paidCents = payload.paidCents === undefined || payload.paidCents === null ||
          payload.paidCents === ""
        ? null
        : readCents(payload.paidCents, "Amount paid");

      const { data, error } = await db.rpc("agent_set_milestone_paid", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_milestone_id: milestoneId,
        p_status: status,
        p_paid_cents: paidCents,
      } as never);
      if (error) throw new Error(`milestone paid failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      if (result.outcome !== "noop") {
        // MONEY MOVING IS THE AUDITABLE EVENT ON THIS TABLE. `trip.total_paid_cents` is
        // recomputed by a trigger from this write, and that figure is subtracted from the
        // trip value to show a traveler their outstanding balance — so the row recording
        // who changed it, and to what, is the one that matters most here.
        await writeAuditEvent(ctx, {
          eventType: "payment_milestone.status_changed",
          targetEntity: "payment_milestone",
          targetId: result.milestone_id,
          metadata: { trip_id: tripId, status, paid_cents: result.paid_cents },
        });
      }

      return json({
        outcome: result.outcome,
        milestoneId: result.milestone_id,
        paidCents: result.paid_cents,
      });
    }

    if (op === "payment_delete") {
      const milestoneId = requireComponentId(payload.milestoneId);

      const { data, error } = await db.rpc("agent_delete_payment_milestone", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_milestone_id: milestoneId,
      });
      if (error) throw new Error(`milestone delete failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw notFound("That trip is not on your board.");

      // A HARD DELETE, so the audit row is the only record left that it ever existed.
      // `payment_milestone` is not on Data-Model §20.1's soft-delete list and nothing
      // references it — but "nothing to cascade" is not the same as "nothing to remember".
      await writeAuditEvent(ctx, {
        eventType: "payment_milestone.deleted",
        targetEntity: "payment_milestone",
        targetId: result.milestone_id,
        metadata: { trip_id: tripId },
      });

      return json({ outcome: result.outcome, milestoneId: result.milestone_id });
    }

    // ── 3.4.4 Reorder ─────────────────────────────────────────────────────
    const ids = payload.componentIds;
    if (!Array.isArray(ids)) throw badRequest("Send the components in their new order.");
    if (ids.length === 0) throw badRequest("Send the components in their new order.");
    if (ids.length > MAX_REORDER) throw badRequest("That is too many components.");
    const componentIds = ids.map((id) => requireComponentId(id));
    // Checked here rather than left to the UPDATE's `WHERE c.id = pos.id`, which would
    // silently apply the first occurrence and leave the trip in an order nobody chose.
    if (new Set(componentIds).size !== componentIds.length) {
      throw badRequest("That order lists a component twice.");
    }

    const { data, error } = await db.rpc("agent_reorder_trip_components", {
      p_trip_id: tripId,
      p_agent_id: agentId,
      p_component_ids: componentIds,
    });

    // THE FUNCTION REFUSES A PARTIAL LIST, and that refusal is a 409 rather than a 500.
    // It means the trip gained or lost a component since this page rendered — a second tab,
    // or the back button — which is a stale write and nothing the advisor did wrong. 409 is
    // the signal `EdgeCallResult.conflict` already carries for exactly this, so the builder
    // can say "reload" instead of "something went wrong on our side".
    if (error) {
      if (error.code === RAISE_EXCEPTION) {
        throw conflict("This trip changed since you opened it. Reload and try again.");
      }
      throw new Error(`component reorder failed: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw notFound("That trip is not on your board.");

    if (result.moved > 0) {
      await writeAuditEvent(ctx, {
        eventType: "trip.components_reordered",
        targetEntity: "trip",
        targetId: tripId,
        metadata: { moved: result.moved, total: componentIds.length },
      });
    }

    return json({ outcome: result.outcome, moved: result.moved });
  } catch (err) {
    return problem(err);
  }
});
