/**
 * The advisor's side of messaging. Screens 3.10.1 (Inbox) and 3.10.2 (Thread), §3.10 Stage 1.
 *
 * Ops:
 *   send     a reply or an internal note, into an existing thread or a new one for a client
 *            (and optionally one of their trips): `agent_send_message`
 *   read     opening a thread clears the advisor's unread count, up to the newest message the
 *            page showed: `agent_mark_conversation_read`
 *   archive  archive from, or bring back to, the inbox: `agent_set_conversations_archived`
 *
 * WHY THE WRITES ARE SQL, where `trip-message` (the client's side) is separate round trips:
 * the send is a thread find-or-create, a message insert and a thread update that must land
 * together, and two of the fields it moves are ones the CLIENT reads. An internal note must
 * never touch `last_message_preview` / `last_message_at`, or the client reads the advisor's
 * private note as their inbox preview; one function that decides that in one place is the
 * difference. See 20261015120000_agent_messaging.sql.
 *
 * WHAT IS NOT HERE: email (Gyasi, 2026-10-13: in-app first, email is Stage 4), templates
 * (Stage 2), and attachments from the advisor (a later stage; the client's attachments are
 * listed on the thread already).
 *
 * The audit row for a send matches `trip-message`'s (`message.created`) and is written after
 * the commit, like every audit row on the messaging side: messages are not one of the
 * sensitive tables CLAUDE.md rule 3 names, and the client path set this shape.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { isUuid, uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import {
  readConversationIds,
  readInternalNote,
  readMessageBody,
  readMessageId,
  readSeenUpTo,
  readThreadAddress,
} from "../_shared/message.ts";

const OPS = ["send", "read", "archive"] as const;
type Op = (typeof OPS)[number];

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

    const op = payload.op;
    if (typeof op !== "string" || !(OPS as readonly string[]).includes(op)) {
      throw badRequest(`Send an op of ${OPS.join(", ")}.`);
    }

    switch (op as Op) {
      case "send": {
        const address = readThreadAddress(payload);
        const body = readMessageBody(payload.body);
        const internalNote = readInternalNote(payload.internalNote);
        const messageId = readMessageId(payload.messageId);
        // Optional: "new message" has nothing on screen yet.
        const seenUpTo = readSeenUpTo(payload.seenUpTo, false);

        const { data, error } = await db.rpc("agent_send_message", {
          p_agent_id: agentId,
          p_actor_user_id: ctx.platformUserId,
          p_message_id: messageId,
          p_body: body,
          p_is_internal_note: internalNote,
          ...(seenUpTo ? { p_seen_up_to: seenUpTo } : {}),
          // `undefined`, not null, for the address not used: the SQL DEFAULTs apply.
          ...(address.kind === "thread"
            ? { p_conversation_id: address.conversationId }
            : {
              p_client_id: address.clientId,
              ...(address.tripId ? { p_trip_id: address.tripId } : {}),
              // Minted only when a new thread may be needed; the SQL uses it if so.
              p_new_conversation_id: uuidV7(),
            }),
        });
        if (error) {
          if (error.code === "23505" && /message_pkey/.test(error.message)) {
            throw badRequest("That message was already sent.");
          }
          throw new Error(`agent send failed: ${error.message}`);
        }

        const result = (Array.isArray(data) ? data[0] : data) as
          | { outcome: string; conversation_id: string | null; created_at: string | null }
          | undefined;
        // Zero rows: not this advisor's thread, client or trip, or gone. One answer for all,
        // so ids cannot be probed.
        if (!result) throw notFound("That thread or client isn't one of yours, or it's gone.");
        if (result.outcome === "note_needs_thread") {
          throw badRequest(
            "Start the thread with a message they can read. Notes can go in after that.",
          );
        }
        if (result.outcome !== "sent") {
          throw new Error(`unhandled agent_send_message outcome: ${result.outcome}`);
        }

        await writeAuditEvent(ctx, {
          eventType: "message.created",
          targetEntity: "message",
          targetId: messageId,
          metadata: {
            conversationId: result.conversation_id,
            internalNote,
            ...(address.kind === "client"
              ? { clientId: address.clientId, tripId: address.tripId }
              : {}),
          },
        });

        return json(
          { messageId, conversationId: result.conversation_id, createdAt: result.created_at },
          201,
        );
      }

      case "read": {
        const conversationId = payload.conversationId;
        if (!isUuid(conversationId)) throw badRequest("That is not a thread id.");
        const seenUpTo = readSeenUpTo(payload.seenUpTo, true) as string;
        const { data, error } = await db.rpc("agent_mark_conversation_read", {
          p_agent_id: agentId,
          p_conversation_id: conversationId,
          p_seen_up_to: seenUpTo,
        });
        if (error) throw new Error(`mark read failed: ${error.message}`);
        // A thread already read, or not this advisor's, both answer `changed: false`: opening
        // a page is not a place to learn whether an id exists.
        return json({ changed: data === true });
      }

      case "archive": {
        const conversationIds = readConversationIds(payload.conversationIds);
        if (typeof payload.archived !== "boolean") {
          throw badRequest("Say whether to archive or bring back.");
        }
        const { data, error } = await db.rpc("agent_set_conversations_archived", {
          p_agent_id: agentId,
          p_conversation_ids: conversationIds,
          p_archived: payload.archived,
        });
        if (error) throw new Error(`archive failed: ${error.message}`);
        return json({ moved: typeof data === "number" ? data : 0, requested: conversationIds.length });
      }
    }
  } catch (err) {
    return problem(err);
  }
});
