import {
  callAgentRead,
  type AgentConversationMessageRow,
  type AgentConversationRow,
  type AgentMessageSummaryRow,
  type AgentMessageTargetRow,
  type AgentMessageThreadRow,
} from "@/lib/agent/api";
import { AGENT_MESSAGES_COPY, messagesHeadline, messagesReplyBy, messagesReplyByShort } from "@/lib/agent/content";
import { INBOX_PAGE_SIZE, threadHref, type InboxQuery } from "@/lib/agent/messageQuery";
import { agentIdentity } from "@/lib/agent/queries";
import { formatInboxTime } from "@/lib/messages/inbox";

/**
 * §3.10 Stage 1's view models: the inbox (3.10.1), a thread (3.10.2) and who a new message is
 * for. Same rules as `queries.ts`: plain JSON-safe data out, formatted here in the advisor's
 * own zone, and `null` from a loader means the READ failed.
 */

export type InboxThread = {
  id: string;
  href: string;
  clientName: string;
  /** The trip, or "General" for a thread about no one trip. */
  tripLabel: string;
  /** What the client last read in their own inbox; "You: " in front when it was the advisor. */
  preview: string;
  timeLabel: string;
  unread: number;
  overdue: boolean;
  /** "Reply by Mon" while a reply is owed and not yet late; null otherwise. */
  replyByLabel: string | null;
  archived: boolean;
};

export type Inbox = {
  headline: string;
  unreadThreads: number;
  overdueThreads: number;
  archivedThreads: number;
  threads: InboxThread[];
  total: number;
  page: number;
  pageCount: number;
};

/** The weekday a reply falls due: `reply_due_at` is the midnight that ENDS that day. */
function dueDay(dueAt: string, timeZone: string): string {
  const lastMoment = new Date(new Date(dueAt).getTime() - 1);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(lastMoment);
}

export function inboxThread(
  row: AgentMessageThreadRow,
  query: InboxQuery,
  timeZone: string,
  now: Date = new Date(),
): InboxThread {
  const preview = row.last_message_preview ?? "";
  return {
    id: row.conversation_id,
    href: threadHref(row.conversation_id, query),
    clientName: row.client_display_name,
    tripLabel: row.trip_title ?? AGENT_MESSAGES_COPY.generalThread,
    preview: row.last_sender_role === "agent" && preview ? `${AGENT_MESSAGES_COPY.youPrefix}${preview}` : preview,
    timeLabel: formatInboxTime(row.last_message_at, timeZone, now),
    unread: row.agent_unread_count,
    overdue: row.overdue,
    replyByLabel: row.reply_due_at && !row.overdue ? messagesReplyByShort(dueDay(row.reply_due_at, timeZone)) : null,
    archived: row.archived,
  };
}

export async function loadInbox(query: InboxQuery): Promise<Inbox | null> {
  const [me, summary, threads] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentMessageSummaryRow>("agent_message_summary"),
    callAgentRead<AgentMessageThreadRow>("agent_message_threads", {
      p_archived: query.archived,
      p_unread: query.unread,
      p_overdue: query.overdue,
      p_client_id: query.clientId,
      p_trip_id: query.tripId,
      p_search: query.search,
      p_limit: INBOX_PAGE_SIZE,
      p_offset: (query.page - 1) * INBOX_PAGE_SIZE,
    }),
  ]);
  if (!summary.ok || !threads.ok) return null;
  // Not an advisor: the summary answers no row rather than a row of zeros.
  const s = summary.rows[0];
  if (!s) return null;

  let total = threads.rows[0]?.total_count ?? 0;
  if (threads.rows.length === 0 && query.page > 1) {
    // A page past the end (the last threads on it were just archived) carries no count. Ask
    // for one row of page one, so the caller can send the advisor to the real last page.
    const first = await callAgentRead<AgentMessageThreadRow>("agent_message_threads", {
      p_archived: query.archived,
      p_unread: query.unread,
      p_overdue: query.overdue,
      p_client_id: query.clientId,
      p_trip_id: query.tripId,
      p_search: query.search,
      p_limit: 1,
      p_offset: 0,
    });
    if (!first.ok) return null;
    total = first.rows[0]?.total_count ?? 0;
  }
  return {
    headline: messagesHeadline(s.unread_threads, s.overdue_threads),
    unreadThreads: s.unread_threads,
    overdueThreads: s.overdue_threads,
    archivedThreads: s.archived_threads,
    threads: threads.rows.map((r) => inboxThread(r, query, me.timeZone)),
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)),
  };
}

export type ThreadAttachment = { id: string; filename: string };

export type ThreadMessageView = {
  id: string;
  sender: "agent" | "client";
  body: string;
  createdAt: string;
  internalNote: boolean;
  attachments: ThreadAttachment[];
  /** §3.10 Stage 4: an email carried this reply to the client. Advisor-only. */
  emailed: boolean;
  /** The client wrote this by replying to an email. */
  byEmail: boolean;
  /** §3.12.2: an out-of-office automatic reply, tagged on both sides. */
  autoReply: boolean;
};

export type ThreadHeader = {
  conversationId: string;
  clientId: string;
  clientName: string;
  clientFirstName: string;
  tripId: string | null;
  tripLabel: string;
  overdue: boolean;
  replyByLabel: string | null;
  archived: boolean;
  clientCanSignIn: boolean;
};

export type ThreadView = {
  header: ThreadHeader;
  messages: ThreadMessageView[];
  /** The advisor's zone, for the day separators and times. */
  timeZone: string;
  /** The read returns the newest 500; a thread that long says so. */
  truncated: boolean;
  /**
   * The newest message's `created_at` EXACTLY as Postgres wrote it (microseconds included),
   * or null for an empty thread. Reading and replying clear only up to here; through `Date`
   * it would lose the microseconds and the newest message would look newer than itself.
   */
  seenUpTo: string | null;
};

export type ThreadResult = { ok: true; thread: ThreadView } | { ok: false; reason: "not-found" | "unavailable" };

export async function loadThread(conversationId: string): Promise<ThreadResult> {
  const [me, conv, msgs] = await Promise.all([
    agentIdentity(),
    callAgentRead<AgentConversationRow>("agent_conversation", { p_conversation_id: conversationId }),
    callAgentRead<AgentConversationMessageRow>("agent_conversation_messages", { p_conversation_id: conversationId }),
  ]);
  if (!conv.ok || !msgs.ok) return { ok: false, reason: "unavailable" };
  const c = conv.rows[0];
  // Zero rows for "no such thread" and "not yours" alike, so ids cannot be probed.
  if (!c) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    thread: {
      header: {
        conversationId: c.conversation_id,
        clientId: c.client_id,
        clientName: c.client_display_name,
        clientFirstName: c.client_first_name,
        tripId: c.trip_id,
        tripLabel: c.trip_title ?? AGENT_MESSAGES_COPY.generalThread,
        overdue: c.overdue,
        replyByLabel: c.reply_due_at && !c.overdue ? messagesReplyBy(dueDay(c.reply_due_at, me.timeZone)) : null,
        archived: c.archived,
        clientCanSignIn: c.client_can_sign_in,
      },
      messages: msgs.rows.map((m) => ({
        id: m.message_id,
        sender: m.sender_role === "client" ? "client" : "agent",
        body: m.body,
        createdAt: m.created_at,
        internalNote: m.is_internal_note,
        attachments: (m.attachments ?? []).map((a) => ({ id: a.document_id, filename: a.filename })),
        emailed: m.emailed_at != null,
        byEmail: m.channel === "email",
        autoReply: m.is_auto_reply === true,
      })),
      timeZone: me.timeZone,
      truncated: (msgs.rows[0]?.total_messages ?? 0) > msgs.rows.length,
      seenUpTo: msgs.rows.at(-1)?.created_at ?? null,
    },
  };
}

export type MessageTarget = {
  clientId: string;
  clientName: string;
  clientFirstName: string;
  tripId: string | null;
  tripLabel: string;
  /** The live thread this message belongs in, when there already is one. */
  conversationId: string | null;
  clientCanSignIn: boolean;
};

export type MessageTargetResult =
  | { ok: true; target: MessageTarget }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadMessageTarget(clientId: string, tripId: string | null): Promise<MessageTargetResult> {
  const res = await callAgentRead<AgentMessageTargetRow>("agent_message_target", {
    p_client_id: clientId,
    p_trip_id: tripId,
  });
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const r = res.rows[0];
  if (!r) return { ok: false, reason: "not-found" };
  return {
    ok: true,
    target: {
      clientId: r.client_id,
      clientName: r.client_display_name,
      clientFirstName: r.client_first_name,
      tripId: r.trip_id,
      tripLabel: r.trip_title ?? AGENT_MESSAGES_COPY.generalThread,
      conversationId: r.conversation_id,
      clientCanSignIn: r.client_can_sign_in,
    },
  };
}
