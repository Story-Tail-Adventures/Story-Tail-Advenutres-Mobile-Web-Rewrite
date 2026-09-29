/**
 * §3.4.13 Trip Template Library's writes.
 *
 * ── ITS OWN DOOR ─────────────────────────────────────────────────────────────
 *
 * Same call `agent-itinerary` made, for the same reason: `agent-trip` already carries seven
 * ops over 500 lines across three entity families, and a template is a fourth. `apply`
 * writes components, itinerary days and activities in one statement — folding that into the
 * trip door would put the two largest write paths in the project in one dispatcher.
 *
 * ── WHAT IT AUDITS ───────────────────────────────────────────────────────────
 *
 * WHAT HAPPENED, not that the route ran. `apply` on a trip that already carries a
 * `template_id` answers `already_applied` and writes no audit row, because nothing changed
 * — the same posture §3.4.14's generator takes on a second press. A log full of clicks is
 * not a history.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";

const OPS = ["save", "update", "archive", "apply"] as const;
type Op = (typeof OPS)[number];

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;

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

/**
 * A name is mandatory on save and on update.
 *
 * The RPC raises on a blank one too, so this is the layer that turns that into a 400 with a
 * sentence rather than a 500 with a Postgres message. Length is checked HERE and not there:
 * `trip_template.name` is unbounded `text`, so the database will happily store an essay,
 * and a card grid is not the place to discover it.
 */
function requireName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw badRequest("A template needs a name.");
  }
  const name = value.trim();
  if (name.length > MAX_NAME) {
    throw badRequest(`A template name is at most ${MAX_NAME} characters.`);
  }
  return name;
}

function optionalDescription(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw badRequest("A description must be text.");
  const text = value.trim();
  if (text === "") return undefined;
  if (text.length > MAX_DESCRIPTION) {
    throw badRequest(`A description is at most ${MAX_DESCRIPTION} characters.`);
  }
  return text;
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

    // ── Save a trip as a template ─────────────────────────────────────────
    if (op === "save") {
      const tripId = requireId(payload.tripId, "trip id");
      const { data, error } = await db.rpc("agent_save_trip_as_template", {
        p_trip_id: tripId,
        p_agent_id: agentId,
        p_name: requireName(payload.name),
        p_description: optionalDescription(payload.description),
      });
      if (error) throw new Error(`template save failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      // Zero rows is "no such trip" and "not yours" alike, deliberately the same answer.
      if (!result) throw notFound("That trip is not on your board.");

      await writeAuditEvent(ctx, {
        eventType: "trip_template.created",
        targetEntity: "trip_template",
        targetId: result.template_id,
        // The SHAPE of what was captured, so the log says what the pattern is rather than
        // that a button was pressed. Not the payload itself: it carries every cost on the
        // source trip, and an audit row is not where a price list belongs.
        metadata: {
          from_trip_id: tripId,
          components_saved: result.components_saved,
          days_saved: result.days_saved,
        },
      });

      return json({
        templateId: result.template_id,
        componentsSaved: result.components_saved,
        daysSaved: result.days_saved,
      });
    }

    // ── Rename / re-describe ──────────────────────────────────────────────
    if (op === "update") {
      const templateId = requireId(payload.templateId, "template id");
      const { data, error } = await db.rpc("agent_update_template", {
        p_template_id: templateId,
        p_agent_id: agentId,
        p_name: requireName(payload.name),
        p_description: optionalDescription(payload.description),
      });
      if (error) throw new Error(`template update failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result || result.outcome === "not_found") {
        throw notFound("That template is not in your library.");
      }

      // `noop` writes nothing. The submitted name matched what was stored, and an audit row
      // saying a template "changed" when it did not is the log lying quietly.
      if (result.outcome === "changed") {
        await writeAuditEvent(ctx, {
          eventType: "trip_template.updated",
          targetEntity: "trip_template",
          targetId: templateId,
          metadata: { outcome: result.outcome },
        });
      }

      return json({ outcome: result.outcome });
    }

    // ── Retire ────────────────────────────────────────────────────────────
    if (op === "archive") {
      const templateId = requireId(payload.templateId, "template id");
      const { data, error } = await db.rpc("agent_archive_template", {
        p_template_id: templateId,
        p_agent_id: agentId,
      });
      if (error) throw new Error(`template archive failed: ${error.message}`);

      const result = Array.isArray(data) ? data[0] : data;
      if (!result || result.outcome === "not_found") {
        throw notFound("That template is not in your library.");
      }

      await writeAuditEvent(ctx, {
        eventType: "trip_template.archived",
        targetEntity: "trip_template",
        targetId: templateId,
        metadata: {},
      });

      return json({ outcome: result.outcome });
    }

    // ── Apply ─────────────────────────────────────────────────────────────
    const templateId = requireId(payload.templateId, "template id");
    const tripId = requireId(payload.tripId, "trip id");

    const { data, error } = await db.rpc("agent_apply_template", {
      p_template_id: templateId,
      p_trip_id: tripId,
      p_agent_id: agentId,
    });
    if (error) throw new Error(`template apply failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.outcome === "not_found") {
      throw notFound("That template or trip is not yours.");
    }

    // `already_applied` IS A 200 WITH AN OUTCOME, not a 409. Nothing is wrong and nothing
    // for the advisor to resolve: the trip already came from a pattern, and the screen
    // should say so where the button is rather than raise a banner. Same call §3.4.14's
    // `no_dates` makes, and the transport surfaces only `detail` on a rejection anyway.
    if (result.outcome === "applied") {
      await writeAuditEvent(ctx, {
        eventType: "trip.seeded_from_template",
        targetEntity: "trip",
        targetId: tripId,
        // WHAT LANDED. A pattern that produced no days because the trip has no dates is a
        // real and honest outcome, and this is where that shows up.
        metadata: {
          template_id: templateId,
          components_added: result.components_added,
          days_added: result.days_added,
          activities_added: result.activities_added,
        },
      });
    }

    return json({
      outcome: result.outcome,
      componentsAdded: result.components_added,
      daysAdded: result.days_added,
      activitiesAdded: result.activities_added,
    });
  } catch (err) {
    return problem(err);
  }
});
