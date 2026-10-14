import { redirect } from "next/navigation";

import { AgentInboxColumn } from "@/components/agent/AgentInboxColumn";
import { RetryState } from "@/components/client/RetryState";
import { inboxHref, threadHref, type InboxQuery } from "@/lib/agent/messageQuery";
import { loadInbox } from "@/lib/agent/messages";

/**
 * The inbox list as the `@list` slot renders it, beside whatever page is open.
 *
 * `heading` is the list's title level: the page's own h1 when the list IS the page, an h2
 * beside a thread or a new message, whose h1 is the client.
 */
export async function AgentInboxSlot({
  query,
  activeId,
  heading,
}: {
  query: InboxQuery;
  activeId: string | null;
  heading: "h1" | "h2";
}) {
  const inbox = await loadInbox(query);
  if (!inbox) return <RetryState />;

  // A page past the end, usually because its last threads were just archived: the real last
  // page, keeping the open thread and every filter.
  if (inbox.threads.length === 0 && query.page > inbox.pageCount) {
    const last = { ...query, page: inbox.pageCount };
    redirect(activeId ? threadHref(activeId, last) : inboxHref(last));
  }

  return <AgentInboxColumn inbox={inbox} query={query} activeId={activeId} heading={heading} />;
}
