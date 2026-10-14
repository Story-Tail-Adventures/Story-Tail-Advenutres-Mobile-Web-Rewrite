import { AgentInboxSlot } from "@/components/agent/AgentInboxSlot";
import { inboxQueryFromParams, type InboxParams } from "@/lib/agent/messageQuery";

/** Screen 3.10.1's list, when the inbox itself is open. */
export default async function InboxListSlot({ searchParams }: { searchParams: Promise<InboxParams> }) {
  return <AgentInboxSlot query={inboxQueryFromParams(await searchParams)} activeId={null} heading="h1" />;
}
