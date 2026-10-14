import { AgentInboxSlot } from "@/components/agent/AgentInboxSlot";
import { inboxQueryFromParams, isUuid, type InboxParams } from "@/lib/agent/messageQuery";

/** The list beside an open thread, with the filters it was opened from and that row marked. */
export default async function ThreadListSlot({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<InboxParams>;
}) {
  const { conversationId } = await params;
  return (
    <AgentInboxSlot
      query={inboxQueryFromParams(await searchParams)}
      activeId={isUuid(conversationId) ? conversationId.toLowerCase() : null}
      heading="h2"
    />
  );
}
