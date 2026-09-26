/**
 * Add, edit and delete a client's internal notes. Screen 3.3.7 (Client Detail, Notes tab).
 *
 * SAME SKELETON AS `agent-trip-notes`, WITH ROWS INSTEAD OF A FIELD. That one edits
 * `trip.notes`, a column on a record that already exists; this manages rows in
 * `client_note`, so it carries an explicit `op` and four outcomes rather than three.
 *
 * NO `expectedVersion`, AND THAT IS DELIBERATE. `client_note` has no `version` column —
 * Data-Model §20.4 lists the tables that do and this is not among them. The migration's
 * header argues why adding one is a Data-Model change rather than this change's business.
 *
 * THE NOTE ID IS GENERATED HERE, as a v7. Data-Model §21.6: ids are time-ordered and
 * client-generated so an offline compose keeps its own, and the backend validates the
 * embedded timestamp is recent — which is exactly what `assertRecentUuidV7` is for when the
 * caller supplies one. This function supplies it, so the id is trusted by construction.
 *
 * WHAT IT REFUSES: not an agent, or an archived one — 403; a client that is not this
 * agent's, does not exist, or is a merged tombstone — 404, one answer for all three; a note
 * that is not this client's or not this author's — 404 likewise; an empty body on create or
 * update — 400.
 *
 * AN AUDIT ROW IS WRITTEN ONLY WHEN SOMETHING ACTUALLY CHANGED. A `noop` is not an event,
 * and the note BODY never reaches the audit metadata: `client_note` is the agent's private
 * prose about a person, and copying it into a table retained for seven years would make the
 * audit trail a second, longer-lived copy of the thing §3.3.7 calls internal.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";

const OPS = ["create", "update", "archive"] as const;
type Op = (typeof OPS)[number];

/** The Notes tab's own cap. Long enough for a real jotting, short enough to bound a write. */
const MAX_BODY = 4000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !OPS.includes(value as Op)) {
    throw badRequest("op must be create, update or archive.");
  }
  return value as Op;
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

    const clientId = payload.clientId;
    if (typeof clientId !== "string" || !isUuid(clientId)) {
      throw badRequest("That is not a client id.");
    }

    const op = requireOp(payload.op);

    // On create the id is ours; on the other two it names an existing row.
    let noteId: string;
    if (op === "create") {
      noteId = uuidV7();
    } else {
      if (typeof payload.noteId !== "string" || !isUuid(payload.noteId)) {
        throw badRequest("That is not a note id.");
      }
      noteId = payload.noteId;
    }

    let body: string | null = null;
    if (op !== "archive") {
      // An empty body is not a way to delete a note — `archive` is. Collapsing the two
      // would make a mistyped save silently destructive.
      if (typeof payload.body !== "string" || payload.body.trim() === "") {
        throw badRequest("A note needs something in it.");
      }
      if (payload.body.length > MAX_BODY) {
        throw badRequest("That note is too long.");
      }
      body = payload.body;
    }

    const { data, error } = await db.rpc("agent_write_client_note", {
      p_client_id: clientId,
      p_agent_id: agentId,
      p_actor_user_id: ctx.platformUserId,
      p_note_id: noteId,
      // THE GENERATED TYPES LIE ABOUT NULLABILITY ON ARGS TOO. `supabase gen types` declares
      // every parameter non-nullable — `p_body: string` — and Postgres takes NULL happily;
      // `archive` is the op that passes one, because a note being removed has no new body.
      // `web/lib/agent/api.ts` records the same lie on the RETURNS TABLE side.
      p_body: body as string,
      p_op: op,
    });

    if (error) throw new Error(`client note write failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    // Zero rows covers every refusal the function makes: no such client, not this agent's,
    // a tombstone, no such note, or not this author's. One answer for all of them, so a
    // caller cannot probe ids by watching which one comes back different.
    if (!result) throw notFound("No such client or note.");

    if (result.outcome === "noop") {
      return json({ clientId, noteId: result.note_id, changed: false });
    }

    if (result.outcome !== "created" && result.outcome !== "changed" &&
        result.outcome !== "archived") {
      throw new Error(`unhandled agent_write_client_note outcome: ${result.outcome}`);
    }

    await writeAuditEvent(ctx, {
      eventType: `client.note_${result.outcome}`,
      targetEntity: "client",
      targetId: clientId,
      // The note id, never the note. See the header.
      metadata: { note_id: result.note_id },
    });

    return json({ clientId, noteId: result.note_id, changed: true, outcome: result.outcome });
  } catch (err) {
    return problem(err);
  }
});
