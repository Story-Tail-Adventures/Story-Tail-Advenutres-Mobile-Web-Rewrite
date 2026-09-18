import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Composer } from "@/components/client/thread/Composer";
import { ThreadMessages } from "@/components/client/thread/ThreadMessages";
import { ThreadScroll } from "@/components/client/thread/ThreadScroll";
import { Icon } from "@/components/ui/Icon";
import { sendTripMessage } from "@/lib/trips/actions";
import { loadTripThread } from "@/lib/trips/queries";
import { THREAD_MESSAGES } from "@/lib/trips/thread";
import { THREAD } from "./content";

export const metadata: Metadata = { title: "Messages" };

/**
 * Screen 2.2.7 Trip Messages / Conversation Thread — docs/Screen-Inventory.md §2.2.7, §4.4
 * ("mobile is full-screen"), and design/source-prototype/screens/client-trip.jsx
 * (C227_TripThread) + client-trip-mobile.jsx (M227_TripThread). P1.
 *
 * THE THREAD BODY IS NOW SHARED WITH 2.6.2, which is what this file's header promised before
 * §2.6 existed: "When §2.6 lands it mounts this route rather than copying it." It does not
 * literally mount this route — a conversation with no trip cannot be addressed by trip id, so
 * `/messages/[conversationId]` is its own route — but the parts that would drift are one
 * component each now, in `components/client/thread/`. What is left here is the header and the
 * choice of action.
 *
 * THE COMPOSE BAR IS A SIBLING OF THE SCROLL, not an overlay on it — the convention
 * `client-auth-mobile.jsx` established and the one thing that keeps a long thread from
 * hiding its own last message behind the input.
 *
 * Two things are load-bearing for that, and the screen shipped broken without the first:
 * `.client-fill` gives the root a definite height (the shell is `min-h-dvh`, so `h-full`
 * resolves against nothing and the compose bar lands below the fold — see client.css), and
 * `min-h-0` lets the middle region shrink below its content instead of growing the column.
 *
 * TWO NAMED PRIMARY ELEMENTS ARE ABSENT, and see `web/lib/trips/thread.ts` for the full
 * reasoning: the typing indicator needs Realtime presence that nothing backs, and read
 * receipts would need `message.read_by_other_at`, which is withheld from the client column
 * grant on purpose.
 */
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const thread = await loadTripThread(tripId);

  if (!thread) notFound();

  return (
    // `.client-fill` is the shell opt-in that gives this screen a definite height — see
    // web/styles/client.css for why `h-full` alone cannot work here. With that in place the
    // header and compose bar are fixed-size flex children and the middle region scrolls.
    <div className="client-fill flex flex-col">
      <header className="shrink-0 border-b border-outline-variant bg-surface px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <Link
            href={`/trips/${tripId}`}
            className="btn-icon tap-44 shrink-0"
            aria-label={THREAD.back}
          >
            <Icon name="arrow_left" size={18} />
          </Link>

          {/* The advisor's initials, matching the artboards' MAdvisorAvatar. A photograph
              would be the real thing, and there is one in the design — but the only asset
              behind it is a stock portrait, and putting a stranger's face on Gyasi is worse
              than initials. */}
          <span
            aria-hidden="true"
            className="t-label inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-burgundy text-[12px] font-bold text-white"
          >
            GS
          </span>

          <div className="min-w-0 flex-1">
            <p className="t-title-s truncate">
              {THREAD.advisorName} · {thread.tripTitle}
            </p>
            <p className="t-body-s text-on-surface-variant">
              {thread.unreadCount > 0
                ? THREAD.unreadLabel(thread.unreadCount)
                : THREAD_MESSAGES.replyWindow}
            </p>
          </div>

          <Link href={`/trips/${tripId}`} className="btn btn-tonal btn-sm shrink-0">
            <span className="hidden md:inline">{THREAD_MESSAGES.openTrip}</span>
            <span className="md:hidden">
              <Icon name="trip" size={14} />
            </span>
          </Link>
        </div>
      </header>

      <ThreadScroll messageCount={thread.messages.length}>
        <div className="mx-auto w-full max-w-3xl">
          <ThreadMessages
            messages={thread.messages}
            timeZone={thread.timeZone}
            documentsHref={`/trips/${tripId}/documents`}
          />
        </div>
      </ThreadScroll>

      <Composer
        // Bound here rather than inside the composer, so the same bar can serve a thread that
        // has no trip to bind. See components/client/thread/Composer.tsx.
        action={sendTripMessage.bind(null, tripId)}
        attachTitle={THREAD.attachDeferred}
      />
    </div>
  );
}
