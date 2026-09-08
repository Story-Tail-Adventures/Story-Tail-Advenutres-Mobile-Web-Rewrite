/**
 * Post a message into a trip thread. Screen 2.2.7.
 *
 * WHY AN EDGE FUNCTION. `message` has SELECT-only RLS and no write policy, so a browser or
 * server-action `.insert()` matches zero rows and returns 204 — it looks like it worked and
 * changes nothing. That is the same trap the onboarding writes documented, and it is worse
 * here: the traveler would watch their message vanish on reload.
 *
 * It also does three things one insert cannot:
 *   * creates the conversation on first message, so a trip with no thread yet works
 *   * denormalizes `last_message_at` and `last_message_preview`, which the inbox and 2.2.3's
 *     tile read instead of joining to the newest message
 *   * bumps `agent_unread_count`, which is the agent's side of the same row
 *
 * NOT ATOMIC, and worth stating. The message insert, the conversation update and the
 * attachment rows are separate round trips on the service role — a failure between them
 * leaves a message with a stale preview or an attachment-less thread. Closing it properly
 * means one Postgres function over RPC, which is the same fix `_shared/audit.ts` already
 * notes it needs before the first financial mutation. Both are worth doing together; a
 * message with a stale preview is not worth doing it for on its own.
 */
import { requireUser } from "../_shared/auth.ts";
import { writeAuditEvent } from "../_shared/audit.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, problem } from "../_shared/problem.ts";
import { assertRecentUuidV7, uuidV7 } from "../_shared/uuid.ts";
import { readJson, requireClientId, requireOwnedTrip, tripDb } from "../_shared/trip.ts";

const MAX_BODY = 8000;
const MAX_ATTACHMENTS = 10;
/** The inbox row shows a snippet, not the message. */
const PREVIEW_LENGTH = 140;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const clientId = requireClientId(ctx);
    const payload = await readJson(req);

    const messageId = payload.messageId;
    if (typeof messageId !== "string") throw badRequest("Send a messageId.");
    try {
      assertRecentUuidV7(messageId);
    } catch (err) {
      throw badRequest(`messageId must be a recent UUID v7: ${(err as Error).message}`);
    }

    const tripId = payload.tripId;
    if (typeof tripId !== "string") throw badRequest("Send a tripId.");

    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) throw badRequest("A message needs something in it.");
    if (body.length > MAX_BODY) throw badRequest(`Keep it under ${MAX_BODY} characters.`);

    const attachmentIds = normaliseAttachments(payload.attachmentDocumentIds);

    const db = tripDb();
    const trip = await requireOwnedTrip(db, clientId, tripId);

    // Find or create the thread. `conversation.trip_id` is nullable because general
    // pre-trip threads exist, so this is scoped by BOTH ids rather than trip alone.
    const { data: existing, error: findError } = await db
      .from("conversation")
      .select("id, agent_unread_count")
      .eq("trip_id", tripId)
      .eq("client_id", clientId)
      .is("archived_at", null)
      .maybeSingle();

    if (findError) throw new Error(`conversation lookup failed: ${findError.message}`);

    let conversationId = existing?.id;
    let agentUnread = existing?.agent_unread_count ?? 0;

    if (!conversationId) {
      conversationId = uuidV7();
      const { error } = await db.from("conversation").insert({
        id: conversationId,
        client_id: clientId,
        agent_id: trip.agentId,
        trip_id: tripId,
        // The trip title, matching the seeded threads. `subject` is nullable and null would
        // work fine for THIS screen, which titles itself from the trip it already loaded —
        // but §2.6's inbox lists conversations without one, and a null subject there is a
        // row with no name. Setting it at creation is the only moment the title is free.
        subject: trip.title,
        last_message_at: new Date().toISOString(),
        last_message_preview: preview(body),
        client_unread_count: 0,
        agent_unread_count: 0,
      });
      if (error) throw new Error(`conversation insert failed: ${error.message}`);
      agentUnread = 0;
    }

    const { data: inserted, error: messageError } = await db
      .from("message")
      .insert({
        id: messageId,
        conversation_id: conversationId,
        sender_user_id: ctx.platformUserId,
        sender_role: "client",
        body,
        // A client cannot write an internal note. Set explicitly rather than left to the
        // column default, because this is the field the read policy filters on.
        is_internal_note: false,
      })
      .select("id, created_at")
      .single();

    if (messageError) {
      if (messageError.code === "23505") throw badRequest("That message was already sent.");
      throw new Error(`message insert failed: ${messageError.message}`);
    }

    if (attachmentIds.length > 0) {
      // Only documents this client owns, and only ones already registered through
      // trip-document. Filtering here rather than trusting the ids is what stops a client
      // attaching somebody else's passport to their own message.
      const { data: owned } = await db
        .from("document")
        .select("id")
        .in("id", attachmentIds)
        .eq("client_id", clientId)
        .is("archived_at", null);

      const usable = (owned ?? []).map((d) => d.id);
      if (usable.length > 0) {
        const { error } = await db.from("message_attachment").insert(
          usable.map((documentId) => ({
            id: uuidV7(),
            message_id: messageId,
            document_id: documentId,
          })),
        );
        if (error) throw new Error(`attachment insert failed: ${error.message}`);
      }
    }

    const { error: bumpError } = await db
      .from("conversation")
      .update({
        last_message_at: inserted.created_at,
        last_message_preview: preview(body),
        // The agent has one more thing to read. The CLIENT's own count is untouched:
        // sending a message does not make it unread to the person who sent it.
        agent_unread_count: agentUnread + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (bumpError) throw new Error(`conversation update failed: ${bumpError.message}`);

    await writeAuditEvent(ctx, {
      eventType: "message.created",
      targetEntity: "message",
      targetId: messageId,
      metadata: { tripId, conversationId, attachments: attachmentIds.length },
    });

    return json(
      {
        messageId: inserted.id,
        conversationId,
        createdAt: inserted.created_at,
      },
      201,
    );
  } catch (err) {
    return problem(err);
  }
});

function normaliseAttachments(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest("attachmentDocumentIds must be an array.");
  if (value.length > MAX_ATTACHMENTS) {
    throw badRequest(`At most ${MAX_ATTACHMENTS} attachments.`);
  }
  const ids = value.filter((v): v is string => typeof v === "string");
  if (ids.length !== value.length) throw badRequest("attachmentDocumentIds must be strings.");
  return [...new Set(ids)];
}

/** Trimmed on a word boundary where one is close enough, so a preview never cuts mid-word. */
function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= PREVIEW_LENGTH) return oneLine;
  const cut = oneLine.slice(0, PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > PREVIEW_LENGTH - 20 ? cut.slice(0, lastSpace) : cut}…`;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
