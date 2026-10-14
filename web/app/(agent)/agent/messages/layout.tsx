import type { ReactNode } from "react";

import { AgentMessagesFrame } from "@/components/agent/AgentMessagesFrame";

/**
 * Screens 3.10.1 (Inbox) and 3.10.2 (Thread) share one frame, A3101's: the list beside the
 * thread. The list is its own slot (`@list`) so it renders once per navigation beside
 * whichever page is open, and the frame around both stays mounted.
 */
export default function AgentMessagesLayout({ children, list }: { children: ReactNode; list: ReactNode }) {
  return <AgentMessagesFrame list={list}>{children}</AgentMessagesFrame>;
}
