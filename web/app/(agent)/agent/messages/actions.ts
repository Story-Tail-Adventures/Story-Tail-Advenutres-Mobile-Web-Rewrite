"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";

/**
 * §3.10 Stage 1's writes, through `agent-message`. Each answers a plain result the calling
 * component shows; nothing here redirects, so a refused send keeps what the advisor typed.
 *
 * Each revalidates the inbox layout and the worklist, and that alone refreshes the page the
 * call came from: no caller adds a `router.refresh()` on top (a second render for nothing).
 */

function revalidateMessages(): void {
  // The inbox, the thread, and the worklist's "Recent messages" all read these rows.
  revalidatePath("/agent/messages", "layout");
  revalidatePath("/agent");
}

export type SendResult = { ok: true; conversationId: string } | { ok: false; message: string };

/**
 * A reply or an internal note. Into an existing thread (`conversationId`), or to a client and
 * optionally one of their trips, which finds their live thread or starts one.
 *
 * `messageId` is minted once per draft by the reply box, so a double send or a retry lands
 * once. `seenUpTo` is the newest message the advisor had on screen: a client message newer
 * than that stays unread.
 */
export async function sendAgentMessageAction(input: {
  conversationId?: string;
  clientId?: string;
  tripId?: string | null;
  messageId: string;
  seenUpTo: string | null;
  body: string;
  internalNote: boolean;
}): Promise<SendResult> {
  const result = await callAgentFunction("agent-message", {
    op: "send",
    messageId: input.messageId,
    body: input.body,
    internalNote: input.internalNote,
    ...(input.seenUpTo ? { seenUpTo: input.seenUpTo } : {}),
    ...(input.conversationId
      ? { conversationId: input.conversationId }
      : { clientId: input.clientId, ...(input.tripId ? { tripId: input.tripId } : {}) }),
  });

  if (result.ok) {
    const conversationId = typeof result.data.conversationId === "string" ? result.data.conversationId : null;
    if (!conversationId) return { ok: false, message: AGENT_MESSAGES_COPY.sendFailed };
    revalidateMessages();
    return { ok: true, conversationId };
  }
  return {
    ok: false,
    message: result.kind === "rejected" ? (result.detail ?? AGENT_MESSAGES_COPY.sendFailed) : AGENT_MESSAGES_COPY.sendFailed,
  };
}

/**
 * Opening a thread reads it, up to the newest message the page showed. Answers whether the
 * count moved; only then does anything need to re-render.
 */
export async function markThreadReadAction(conversationId: string, seenUpTo: string): Promise<{ changed: boolean }> {
  const result = await callAgentFunction("agent-message", { op: "read", conversationId, seenUpTo });
  if (!result.ok || result.data.changed !== true) return { changed: false };
  revalidateMessages();
  return { changed: true };
}

export type ArchiveResult = { ok: true; moved: number } | { ok: false; message: string };

/** Archive from the inbox, or bring back. The client's own view of the thread never changes. */
export async function setThreadsArchivedAction(conversationIds: string[], archived: boolean): Promise<ArchiveResult> {
  const result = await callAgentFunction("agent-message", { op: "archive", conversationIds, archived });
  if (result.ok) {
    revalidateMessages();
    return { ok: true, moved: typeof result.data.moved === "number" ? result.data.moved : 0 };
  }
  return {
    ok: false,
    message: result.kind === "rejected" ? (result.detail ?? AGENT_MESSAGES_COPY.archiveFailed) : AGENT_MESSAGES_COPY.archiveFailed,
  };
}
