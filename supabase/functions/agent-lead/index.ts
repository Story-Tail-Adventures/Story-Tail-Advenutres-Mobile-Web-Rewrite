/**
 * The advisor's lead actions. Screen Inventory §3.8 (revived 2026-10-21, BRD §6.5,
 * Data-Model §11). P2.
 *
 * ONE FUNCTION, SIX OPS, the house shape (`agent-client`, `account-admin`): each is
 * `requireUser` → `requireAgentId` (aal2, not archived) → one SQL function → an audit row.
 *
 *   create          3.8.5 Add lead. `client_exists` when the email is already a client's:
 *                   nothing is written and the screen offers "Open client".
 *   mark_contacted  new -> contacted.
 *   close           with a listed reason and an optional private note.
 *   reopen          closed -> contacted (or new); 409 when the email has another open lead.
 *   convert         links the lead to one of this advisor's clients. 3.8.3 "Invite to an
 *                   account" is three calls the web makes: create the client (`agent-client`),
 *                   send the invite (`account-admin`), then this. Creating the client usually
 *                   converts the lead already (a trigger, Data-Model §11.1); this makes it
 *                   certain even when the advisor changed the email in the dialog.
 *   delete_spam     deletes the lead and its messages. Refused for a converted lead.
 *
 * WHAT IT REFUSES: not an aal2 advisor — 403; a lead (or client) that is not this advisor's or
 * does not exist — 404, one answer for both; a malformed request or a card number in a note —
 * 400; an op the lead's state does not allow — 409.
 *
 * AUDIT ROWS CARRY NO PERSONAL INFORMATION. The lead id, the op, the source or reason; never a
 * name, an email, a phone number or what anybody wrote. A deleted lead's row is then all that
 * is left of it, which is the point of deleting it.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import { parseClose, parseManualLead, requireLeadOp } from "../_shared/lead.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { readJson } from "../_shared/trip.ts";
import { isUuid } from "../_shared/uuid.ts";

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
    const op = requireLeadOp(payload.op);

    if (op === "create") {
      const input = parseManualLead(payload);
      const { data, error } = await db.rpc("agent_lead_create", {
        p_agent_id: agentId,
        p_first_name: input.firstName,
        p_last_name: input.lastName as string,
        p_email: input.email,
        p_phone: input.phone as string,
        p_source: input.source,
        p_body: input.message,
      });
      if (error) throw new Error(`agent_lead_create failed: ${error.message}`);
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) throw new Error("agent_lead_create returned nothing");

      if (result.outcome === "client_exists") {
        return json({ outcome: "client_exists", clientId: result.client_id });
      }
      if (result.outcome !== "created" && result.outcome !== "added") {
        throw new Error(`unhandled agent_lead_create outcome: ${result.outcome}`);
      }
      await writeAuditEvent(ctx, {
        eventType: result.outcome === "created" ? "lead.created" : "lead.note_added",
        targetEntity: "lead",
        targetId: result.lead_id,
        metadata: { source: input.source },
      });
      return json({ outcome: result.outcome, leadId: result.lead_id });
    }

    const leadId = payload.leadId;
    if (typeof leadId !== "string" || !isUuid(leadId)) throw badRequest("That is not a lead id.");

    let reason: string | null = null;
    let note: string | null = null;
    if (op === "close") {
      const close = parseClose(payload);
      reason = close.reason;
      note = close.note;
    }

    let clientId: string | null = null;
    if (op === "convert") {
      if (typeof payload.clientId !== "string" || !isUuid(payload.clientId)) {
        throw badRequest("That is not a client id.");
      }
      clientId = payload.clientId;
    }

    const { data, error } = await db.rpc("agent_lead_write", {
      p_agent_id: agentId,
      p_lead_id: leadId,
      p_op: op,
      p_close_reason: reason as never,
      p_close_note: note as string,
      p_client_id: clientId as string,
    });
    if (error) throw new Error(`agent_lead_write failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] : data;
    // Zero rows: no such lead, not this advisor's, or (convert) no such client of theirs.
    if (!result) throw notFound("No such lead.");

    switch (result.outcome) {
      case "noop":
        return json({ leadId, outcome: "noop", status: result.status });
      case "refused":
        throw conflict("That lead has moved on since this page loaded. Reload to see where it stands.");
      case "conflict":
        throw conflict("This email already has an open lead. Open that one instead.");
      case "changed":
      case "deleted":
        break;
      default:
        throw new Error(`unhandled agent_lead_write outcome: ${result.outcome}`);
    }

    await writeAuditEvent(ctx, {
      eventType: result.outcome === "deleted" ? "lead.deleted_as_spam" : `lead.${op === "mark_contacted" ? "contacted" : op === "close" ? "closed" : op === "reopen" ? "reopened" : "converted"}`,
      targetEntity: "lead",
      targetId: leadId,
      metadata: {
        ...(reason ? { reason } : {}),
        ...(clientId ? { client_id: clientId } : {}),
        status: result.status,
      },
    });

    return json({ leadId, outcome: result.outcome, status: result.outcome === "deleted" ? null : result.status });
  } catch (err) {
    return problem(err);
  }
});
