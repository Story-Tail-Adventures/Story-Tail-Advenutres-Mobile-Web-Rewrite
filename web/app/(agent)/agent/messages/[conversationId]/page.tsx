import { notFound } from "next/navigation";

import { AgentThreadView } from "@/components/agent/AgentThreadView";
import { RetryState } from "@/components/client/RetryState";
import { inboxQueryFromParams, isUuid, type InboxParams } from "@/lib/agent/messageQuery";
import { loadThread } from "@/lib/agent/messages";

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
  searchParams: Promise<InboxParams>;
}) {
  const { conversationId } = await params;
  if (!isUuid(conversationId)) notFound();
  const query = inboxQueryFromParams(await searchParams);

  const result = await loadThread(conversationId);
  // "Not yours" and "not there" are one answer, so ids cannot be probed.
  if (!result.ok && result.reason === "not-found") notFound();
  if (!result.ok) return <RetryState />;

  return <AgentThreadView thread={result.thread} query={query} />;
}
