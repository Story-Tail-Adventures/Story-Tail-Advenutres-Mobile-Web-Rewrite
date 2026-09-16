import { MESSAGES } from "@/lib/messages/content";
// TYPE ONLY, and it has to stay that way. `./queries` imports `lib/supabase/server`, which
// imports `next/headers`; a value import here would pull that into the client bundle, because
// the inbox list is a client component. A type import is erased and costs nothing.
import type { InboxConversation } from "@/lib/messages/queries";
import { formatDaySeparator, formatMessageTime, THREAD_MESSAGES } from "@/lib/trips/thread";

/**
 * Screen 2.6.1's rows, formatted.
 *
 * WHY THE ROWS ARE PRE-FORMATTED ON THE SERVER rather than rendered from raw timestamps in
 * the list component. The list is a client component — it has a search box — and "is this
 * timestamp today?" is a question whose answer depends on both a clock and a time zone. Asked
 * in the browser it is asked against the VIEWER'S clock, while the server already rendered the
 * same row against `platform_user.time_zone`; the two disagree across a midnight boundary and
 * React reports a hydration mismatch on a screen that was, until then, correct.
 *
 * The same trap in reverse is documented at length in `lib/trips/thread.ts`: format in the
 * traveler's stored zone, deterministically, on the server. So the client component receives
 * strings and searches strings, and owns no dates at all.
 */
export type InboxRow = {
  id: string;
  href: string;
  /** Trip title, else subject, else the advisor's name. See [inboxTitle]. */
  title: string;
  /** The trip's name as the row's kicker, or null on the general thread. */
  tripLabel: string | null;
  preview: string;
  /** "2:14p" today, "Yesterday", else "Mar 14". */
  time: string;
  unreadCount: number;
};

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
 *
 * Lives here rather than beside the query that uses it because the inbox list is a client
 * component — see the import note at the top of this file.
 */
export function inboxTitle(row: { subject: string | null; tripTitle: string | null }): string {
  return row.tripTitle ?? row.subject ?? MESSAGES.generalThreadTitle;
}

/**
 * "2:14p" for today, "Yesterday", else "Mar 14".
 *
 * The desktop frame has a third tier — a bare weekday ("Tue") for the last week — which is
 * dropped. It would need seven new strings and a Kotlin twin for each, under CI parity, to
 * save a traveler with three threads from reading a date. `formatDaySeparator` already
 * answers this question correctly in the traveler's zone, and reusing it is worth more than
 * the tier.
 */
export function formatInboxTime(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const day = formatDaySeparator(iso, timeZone, now);
  if (day === THREAD_MESSAGES.today) return formatMessageTime(iso, timeZone);
  return day;
}

/**
 * An empty preview is possible: `last_message_preview` is nullable, and a conversation exists
 * for a moment before its first message lands. The row still has to render — a thread that
 * vanishes because one column is null is worse than a thread with a quiet line under it.
 */
export function inboxRows(
  conversations: InboxConversation[],
  timeZone: string,
  now: Date = new Date(),
): InboxRow[] {
  return conversations.map((conversation) => ({
    id: conversation.id,
    href: `/messages/${conversation.id}`,
    title: inboxTitle(conversation),
    tripLabel: conversation.tripTitle,
    preview: conversation.lastMessagePreview ?? "",
    time: formatInboxTime(conversation.lastMessageAt, timeZone, now),
    unreadCount: conversation.unreadCount,
  }));
}

/**
 * Search, over what the row actually shows.
 *
 * NOT A SERVER SEARCH. `message.body` is readable, so a full-text search over the whole
 * history would be possible — but `last_message_preview` is the only message text the inbox
 * has loaded, and a search that matched a message the traveler cannot see in the list would
 * return rows whose visible text does not contain what they typed. Searching exactly what is
 * on screen is the honest version of this control. Searching inside a thread belongs to 2.6.2
 * and is not built.
 */
export function filterRows(rows: InboxRow[], query: string): InboxRow[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return rows;
  return rows.filter((row) =>
    [row.title, row.preview, row.tripLabel ?? ""].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}
