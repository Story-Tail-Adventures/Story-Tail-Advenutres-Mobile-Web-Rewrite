import { MESSAGES } from "@/lib/messages/content";
import { createClient } from "@/lib/supabase/server";
import {
  currentPlatformUser,
  loadThreadMessages,
  type ThreadMessage,
} from "@/lib/trips/queries";

/**
 * Screen Inventory §2.6's reads.
 *
 * THE READ SIDE OF THIS SECTION ALREADY EXISTED. `conversation` and `message` got policies
 * *and* column grants back in `20260907031255_trip_read_policies.sql`, including
 * `client_unread_count`, `last_message_preview`, `subject` and `archived_at` — so §2.6 needs
 * no migration to render. That is unusual in this repo and worth stating, because the
 * instinct on a new section is to reach for one.
 *
 * WHAT IS NOT GRANTED, and therefore cannot appear on any of these screens:
 *   * `agent_unread_count` — so no "Gyasi has N unread" anywhere on the client side.
 *   * `message.read_by_other_at` — so no read receipts. Withheld on purpose: the semantics
 *     are undecided, and shipping it would make a promise about Gyasi's attention that
 *     nobody agreed to.
 *   * `message.is_internal_note` — the notes are invisible via a ROW predicate rather than
 *     redacted, so naming the column would raise 42501.
 *
 * ARCHIVED THREADS ARE UNREADABLE. `conversation_self_select` carries `archived_at IS NULL`
 * in its USING clause, so there is no client-side archive view to build and no "Archived"
 * tab to add without a policy change. §2.6.1 was amended to drop the archive action for
 * exactly this reason.
 */

export type InboxConversation = {
  id: string;
  /** Null for a general thread — nothing sets a subject on one. See [inboxTitle]. */
  subject: string | null;
  tripId: string | null;
  tripTitle: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
};

/**
 * Screen 2.6.1's list.
 *
 * KEYED ON THE CLIENT, NOT A TRIP, which is the whole difference from every conversation
 * read §2.2 has: those are `.eq("trip_id", …).limit(1)` single-row lookups, and none of them
 * can see a thread with no trip. `conversation_self_select` already scopes rows to the
 * caller, so this needs no filter of its own.
 *
 * The trip title is embedded rather than joined in a second pass; `trip`'s own policy still
 * applies to the embedded side, so an unreadable trip comes back null and the row falls back
 * to its subject.
 *
 * Returns null on a failed read so the caller can render §5's error state. An empty array
 * means "no conversations", which is a different thing and gets the empty state.
 */
export async function loadInbox(): Promise<InboxConversation[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation")
    .select("id, subject, trip_id, last_message_at, last_message_preview, client_unread_count, trip:trip_id (title)")
    .order("last_message_at", { ascending: false });

  if (error) {
    console.warn("[messages] inbox read failed", { code: error.code });
    return null;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    tripId: row.trip_id,
    tripTitle: row.trip?.title ?? null,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    // Granted, and rendered — but see the note on the inbox screen: nothing increments this
    // today, so it is always 0 until an agent send path exists.
    unreadCount: row.client_unread_count ?? 0,
  }));
}

export type ConversationThreadView = {
  conversationId: string;
  /** What the header shows. Never null — see [inboxTitle]. */
  title: string;
  /** Null on a general thread, which is what suppresses 2.6.2's "Open trip". */
  tripId: string | null;
  unreadCount: number;
  timeZone: string;
  messages: ThreadMessage[];
};

/**
 * Screen 2.6.2, addressed by conversation.
 *
 * NOT `loadTripThread`. That one resolves the conversation FROM a trip and returns null when
 * the trip row is unreadable, so a thread with `trip_id IS NULL` can never be reached
 * through it — 2.6.2 would 404 on exactly the threads 2.6.3 creates. The message body is
 * still the same read, shared as `loadThreadMessages`.
 */
export async function loadConversationThread(
  conversationId: string,
): Promise<ConversationThreadView | null> {
  const supabase = await createClient();

  const { data: conversation, error } = await supabase
    .from("conversation")
    .select("id, subject, trip_id, client_unread_count, trip:trip_id (title)")
    .eq("id", conversationId)
    .maybeSingle();

  // No row is the same answer as not yours and as archived: `conversation_self_select` does
  // all three, and the caller turns it into a 404.
  if (error || !conversation) {
    if (error) console.warn("[messages] thread read failed", { code: error.code });
    return null;
  }

  const [messages, me] = await Promise.all([
    loadThreadMessages(conversation.id),
    currentPlatformUser(),
  ]);

  return {
    conversationId: conversation.id,
    title: inboxTitle({
      subject: conversation.subject,
      tripTitle: conversation.trip?.title ?? null,
    }),
    tripId: conversation.trip_id,
    unreadCount: conversation.client_unread_count ?? 0,
    timeZone: me.timeZone,
    messages,
  };
}

/**
 * What to call a thread.
 *
 * `subject` is set to the trip title when `trip-message` creates a trip thread, so it is
 * almost always there. A GENERAL THREAD HAS NEITHER: 2.6.3 deliberately does not ask for a
 * subject line, because a subject field is the first step towards a structured intake form,
 * and BRD §6.5 consolidated intake onto `quote-request` precisely so there would not be a
 * second queue. So the fallback is a name for the conversation rather than a description of
 * it — the person you are talking to.
 *
 * The trip title is preferred over a stale subject when both exist, because a trip can be
 * renamed after the thread was created and the header should follow the trip.
 */
export function inboxTitle(row: { subject: string | null; tripTitle: string | null }): string {
  return row.tripTitle ?? row.subject ?? MESSAGES.generalThreadTitle;
}
