import { notFound } from "next/navigation";

import { AgentThreadView } from "@/components/agent/AgentThreadView";
import { RetryState } from "@/components/client/RetryState";
import { inboxQueryFromParams, isUuid, type InboxParams } from "@/lib/agent/messageQuery";
import { loadThread } from "@/lib/agent/messages";
import { loadPickerData } from "@/lib/agent/messageTemplates";

/**
 * Screen 3.10.2 — Conversation Thread (Agent View). §4.4 Pattern C, chat-style; the artboard
 * draws it as A3101's right pane, so from `lg` the inbox list (the `@list` slot, with the
 * filters it was opened from) stays beside it.
 */
export const metadata = { title: "Messages" };

export default async function AgentThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<InboxParams & { remind?: string; reply?: string }>;
}) {
  const { conversationId } = await params;
  if (!isUuid(conversationId)) notFound();
  const search = await searchParams;
  const query = inboxQueryFromParams(search);

  const result = await loadThread(conversationId);
  // "Not yours" and "not there" are one answer, so ids cannot be probed.
  if (!result.ok && result.reason === "not-found") notFound();
  if (!result.ok) return <RetryState />;

  // The template picker (§3.10.3) merges this thread's client and trip, and, from Trip
  // Detail's "Remind the client", one payment milestone. A failed read offers no picker; the
  // thread itself still works.
  const { header } = result.thread;
  const picker = await loadPickerData(header.clientId, header.tripId, isUuid(search.remind) ? search.remind : null);

  // `?reply=1` is a web notification's click (§3.10.7, ruling 3): the reply box is ready.
  return <AgentThreadView thread={result.thread} query={query} picker={picker} replyReady={search.reply === "1"} />;
}
