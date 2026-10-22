import { AgentInboxSlot } from "@/components/agent/AgentInboxSlot";
import { EMPTY_INBOX_QUERY } from "@/lib/agent/messageQuery";

/**
 * The list beside "new message". Unfiltered: the page's own `client` and `trip` parameters
 * name who the message is for, not a filter, and would otherwise narrow the list to the
 * thread that does not exist yet.
 */
export default function NewMessageListSlot() {
  return <AgentInboxSlot query={EMPTY_INBOX_QUERY} activeId={null} heading="h2" />;
}
