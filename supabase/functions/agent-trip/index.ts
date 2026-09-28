/**
 * Create a trip. Screen 3.4.3.
 *
 * ── A SEPARATE DOOR FROM `agent-trip-status` ─────────────────────────────────
 *
 * That function is about a trip's STAGE: it takes a version, refuses a stale write, and
 * writes a `trip_status_history` row for the transition. Creating a trip is none of those —
 * there is no prior stage to move from and nothing to be stale against. Folding create into
 * it would mean a second op that ignores every parameter the first one exists for.
 *
 * §3.4.4's component writes will land here, which is why this is `agent-trip` and not
 * `agent-create-trip`.
 *
 * ── THE ID IS MINTED HERE ────────────────────────────────────────────────────
 *
 * v7, client-side of the database, per Data-Model §21.6 — the callers that CAN hand Postgres
 * a time-ordered id do, and this one can. It also means the redirect target is known before
 * the write returns.
 *
 * `trip` is not on CLAUDE.md rule 3's list the way `client` is, but a trip carries a
 * client's money and an advisor's commission, and every other write on this surface audits.
 * One less place to wonder about.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function isTripType(value: unknown): value is TripType {
  return typeof value === "string" && (TRIP_TYPES as readonly string[]).includes(value);
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

    if (payload.op !== undefined && payload.op !== "create") {
      throw badRequest("op must be create.");
    }

    const clientId = payload.clientId;
    if (typeof clientId !== "string" || !isUuid(clientId)) {
      throw badRequest("Pick a client for this trip.");
    }

    if (!isTripType(payload.tripType)) {
      throw badRequest(`Send a trip type of ${TRIP_TYPES.join(", ")}.`);
    }

    const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
    if (rawTitle === "") throw badRequest("Give the trip a name.");
    if (rawTitle.length > MAX_TITLE) throw badRequest("That name is too long.");

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
  } catch (err) {
    return problem(err);
  }
});
