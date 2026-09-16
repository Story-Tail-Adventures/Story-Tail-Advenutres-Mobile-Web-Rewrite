import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InboxList } from "@/components/client/messages/InboxList";
import { Composer } from "@/components/client/thread/Composer";
import { ThreadMessages } from "@/components/client/thread/ThreadMessages";
import { ThreadScroll } from "@/components/client/thread/ThreadScroll";
import { Icon } from "@/components/ui/Icon";
import { sendConversationMessage } from "@/lib/messages/actions";
import { MESSAGES } from "@/lib/messages/content";
import { inboxRows } from "@/lib/messages/inbox";
import { loadConversationThread, loadInbox } from "@/lib/messages/queries";
import { currentPlatformUser } from "@/lib/trips/queries";
import { THREAD_MESSAGES } from "@/lib/trips/thread";

export const metadata: Metadata = { title: MESSAGES.title };

/**
 * Screen 2.6.2 Conversation Thread — docs/Screen-Inventory.md §2.6.2, §4.4 (Pattern **C**,
 * "Mobile is full-screen"), and design/source-prototype/screens/client-messaging.jsx
 * (C262_ConversationThread) + client-messaging-mobile.jsx (M262_ConversationThread). P1.
 *
 * IT IS 2.2.7 WITH A DIFFERENT HEADER, which is what the mobile artboard requires in so many
 * words. The scroll, the bubbles, the day separators, the attachment chips and the compose bar
 * are the same four components that route mounts; what differs is where Back goes, what the
 * title says, whether "Open trip" is there at all, and which action the composer is bound to.
 *
 * WHY IT IS NOT LITERALLY THAT ROUTE. `/trips/[tripId]/messages` resolves the conversation
 * FROM a trip, and the thread 2.6.3 creates has `trip_id IS NULL`. There is no trip id that
 * reaches it, so the screens that most need this one — a traveler with no trip yet — would
 * 404 on every thread they own. Addressing by conversation is the whole point of the section.
 *
 * THE LIST STAYS BESIDE IT at `web:`, so master-detail is a real two-pane rather than a
 * full-page swap. Below that breakpoint the thread is the whole screen, which is the push
 * §4.4 specifies.
 *
 * ABSENT, all recorded as departures in client-messaging-mobile.jsx: the presence dot
 * (nothing backs it), "· Read" under a sent message (`message.read_by_other_at` is withheld
 * from the client grant on purpose), reactions (no entity, none specified), and the overflow
 * menu, whose only drawn item was the archive action §2.6.1 does not have either.
 */
export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [thread, conversations, me] = await Promise.all([
    loadConversationThread(conversationId),
    loadInbox(),
    currentPlatformUser(),
  ]);

  // No row, not yours, and archived are one answer here, exactly as they are in the Edge
  // Function: `conversation_self_select` makes all three invisible, so none of them can be
  // told apart and none of them should be.
  if (!thread) notFound();

  const rows = conversations ? inboxRows(conversations, me.timeZone) : [];

  return (
    <div className="client-fill flex">
      {/* Hidden below `web:` — at that width the thread IS the screen and the list is the
          place Back returns to. Only `web:` on these, never paired with `md:`. */}
      <InboxList
        rows={rows}
        activeId={thread.conversationId}
        className="hidden web:flex web:w-[340px] web:shrink-0 web:border-r web:border-outline-variant"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-outline-variant bg-surface px-4 py-3 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            {/* Back to the inbox, not to a trip. On `web:` the list is already beside this,
                so the control is redundant there and hidden rather than made to lie about
                where it goes. */}
            <Link
              href="/messages"
              className="btn-icon tap-44 shrink-0 web:hidden"
              aria-label={MESSAGES.backToMessages}
            >
              <Icon name="arrow_left" size={18} />
            </Link>

            <span
              aria-hidden="true"
              className="t-label inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-burgundy text-[12px] font-bold text-white"
            >
              {MESSAGES.advisorInitials}
            </span>

            <div className="min-w-0 flex-1">
              <p className="t-title-s truncate">{thread.title}</p>
              <p className="t-body-s text-on-surface-variant">{MESSAGES.replyWindow}</p>
            </div>

            {/* Only when there is a trip to open. The general thread has none, and a
                disabled button explaining that would be furniture. */}
            {thread.tripId && (
              <Link href={`/trips/${thread.tripId}`} className="btn btn-tonal btn-sm shrink-0">
                <span className="hidden md:inline">{MESSAGES.openTrip}</span>
                <span className="md:hidden">
                  <Icon name="trip" size={14} />
                </span>
              </Link>
            )}
          </div>
        </header>

        <ThreadScroll messageCount={thread.messages.length}>
          <div className="mx-auto w-full max-w-3xl">
            <ThreadMessages
              messages={thread.messages}
              timeZone={thread.timeZone}
              // A general thread has no trip library to open, so its attachments point at the
              // account-wide one (2.5.4). A trip thread keeps its own.
              documentsHref={thread.tripId ? `/trips/${thread.tripId}/documents` : "/documents"}
              // The shared default names a trip. Right on a trip thread, wrong on the one
              // kind of thread that has none.
              emptyBody={thread.tripId ? undefined : MESSAGES.threadEmptyBody}
            />
          </div>
        </ThreadScroll>

        <Composer
          action={sendConversationMessage.bind(null, thread.conversationId)}
          attachTitle={MESSAGES.attachDeferred}
          placeholder={THREAD_MESSAGES.composePlaceholder}
        />
      </div>
    </div>
  );
}
