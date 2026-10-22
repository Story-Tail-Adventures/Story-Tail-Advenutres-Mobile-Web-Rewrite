/**
 * §3.10 Stage 2: the advisor's message templates (Screens 3.10.4 Library and 3.10.5 Editor).
 *
 * ── ITS OWN DOOR ─────────────────────────────────────────────────────────────
 *
 * Not more ops on `agent-message`, which sends to clients: a template reaches no one until an
 * advisor inserts it and sends the result, so editing one is library upkeep, not messaging.
 * Not `agent-template` either, which is §3.4.13's TRIP templates.
 *
 * ── NO AUDIT ROWS ────────────────────────────────────────────────────────────
 *
 * Gyasi, 2026-10-14. A template holds no client data, so it is outside Rule 3's sensitive
 * tables, and the message it becomes is recorded the usual way when it is sent. The writes
 * still go through here rather than an RPC grant, because each SQL write takes the agent id
 * as trusted input.
 *
 * ── IDS ──────────────────────────────────────────────────────────────────────
 *
 * Create and duplicate take an id the browser minted (Data-Model §21.6), so a double click or
 * a retry answers `exists` and writes once. `conflict` means the id is someone else's, which
 * only a forged request reaches; it says no more than "not yours".
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7, isUuid } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import { readCategory, readTags, readTemplateBody, readTemplateName } from "../_shared/messageTemplate.ts";

const OPS = ["create", "update", "duplicate", "archive"] as const;
type Op = (typeof OPS)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireId(value: unknown): string {
  if (!isUuid(value)) throw badRequest("That is not a template id.");
  return value;
}

/** An id the browser minted for a new row: a recent v7. */
function requireNewId(value: unknown): string {
  if (typeof value !== "string") throw badRequest("Send the new template with its id.");
  try {
    assertRecentUuidV7(value);
  } catch {
    throw badRequest("That form is out of date. Reload the page and try again.");
  }
  return value;
}

function outcomeOf(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" && "outcome" in row ? String((row as { outcome: unknown }).outcome) : null;
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

    const op = payload.op;
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) {
      throw badRequest(`Send an op of ${OPS.join(", ")}.`);
    }

    switch (op as Op) {
      case "create":
      case "update": {
        const templateId = op === "create" ? requireNewId(payload.templateId) : requireId(payload.templateId);
        const fields = {
          p_template_id: templateId,
          p_agent_id: agentId,
          p_category: readCategory(payload.category),
          p_name: readTemplateName(payload.name),
          p_body: readTemplateBody(payload.body),
          p_tags: readTags(payload.tags),
        };
        const { data, error } = await db.rpc(
          op === "create" ? "agent_create_message_template" : "agent_update_message_template",
          fields,
        );
        if (error) throw new Error(`template ${op} failed: ${error.message}`);

        const outcome = outcomeOf(data);
        if (!outcome || outcome === "not_found" || outcome === "conflict") {
          throw notFound("That template is not in your library.");
        }
        return json({ outcome, templateId });
      }

      case "duplicate": {
        const sourceId = requireId(payload.templateId);
        const newId = requireNewId(payload.newTemplateId);
        const { data, error } = await db.rpc("agent_duplicate_message_template", {
          p_source_id: sourceId,
          p_new_id: newId,
          p_agent_id: agentId,
        });
        if (error) throw new Error(`template duplicate failed: ${error.message}`);

        const outcome = outcomeOf(data);
        if (!outcome || outcome === "not_found" || outcome === "conflict") {
          throw notFound("That template is not in your library.");
        }
        return json({ outcome, templateId: newId });
      }

      case "archive": {
        const templateId = requireId(payload.templateId);
        if (typeof payload.archived !== "boolean") throw badRequest("archived must be true or false.");
        const { data, error } = await db.rpc("agent_set_message_template_archived", {
          p_template_id: templateId,
          p_agent_id: agentId,
          p_archived: payload.archived,
        });
        if (error) throw new Error(`template archive failed: ${error.message}`);

        const outcome = outcomeOf(data);
        if (!outcome || outcome === "not_found") throw notFound("That template is not in your library.");
        return json({ outcome });
      }
    }
  } catch (err) {
    return problem(err);
  }
});
