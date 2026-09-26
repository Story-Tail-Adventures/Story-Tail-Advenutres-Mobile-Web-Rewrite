/**
 * Edit a trip's agent-only notes. Screen 3.4.2 (Trip Detail, Notes tab).
 *
 * SAME SKELETON AS `agent-trip-status`, SHORTER BODY. `agent_set_trip_notes` has three
 * outcomes, not four — no `reason_changed` shape, because notes carry no mandatory
 * companion field the way a cancellation's reason is. `expectedVersion` is required for the
 * same reason the stage write requires it: two tabs open on the same trip is exactly what
 * `trip.version` is for.
 *
 * WHAT IT REFUSES: not an agent, or an archived one — 403; a trip that is not this agent's,
 * or does not exist — 404, one answer for both; `notes` that is not a string — 400; a stale
 * `expectedVersion` — 409.
 *
 * AN AUDIT ROW IS WRITTEN ONLY WHEN SOMETHING ACTUALLY CHANGED — a `noop` write is not an
 * event, and logging one would put a `trip.notes_changed` row in the trail for a save that
 * changed nothing.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId, requireExpectedVersion } from "../_shared/agent.ts";

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
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);

    const tripId = payload.tripId;
    if (typeof tripId !== "string" || !isUuid(tripId)) {
      throw badRequest("That is not a trip id.");
    }

    // Empty string clears the notes field; only a non-string is malformed.
    const notes = payload.notes;
    if (typeof notes !== "string") {
      throw badRequest("notes must be text.");
    }

    const expectedVersion = requireExpectedVersion(payload.expectedVersion);

    const { data, error } = await db.rpc("agent_set_trip_notes", {
      p_trip_id: tripId,
      p_agent_id: agentId,
      p_notes: notes,
      p_expected_version: expectedVersion,
    });

    if (error) throw new Error(`trip notes write failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw notFound("No such trip.");

    if (result.outcome === "stale") {
      throw conflict("This trip changed since you opened it. Reload and try again.");
    }

    if (result.outcome === "noop") {
      return json({ tripId, version: result.version, changed: false });
    }

    if (result.outcome !== "changed") {
      throw new Error(`unhandled agent_set_trip_notes outcome: ${result.outcome}`);
    }

    await writeAuditEvent(ctx, {
      eventType: "trip.notes_changed",
      targetEntity: "trip",
      targetId: tripId,
      metadata: { version: result.version },
    });

    return json({ tripId, version: result.version, changed: true });
  } catch (err) {
    return problem(err);
  }
});
