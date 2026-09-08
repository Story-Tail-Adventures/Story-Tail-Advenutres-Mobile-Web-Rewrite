import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { documentBadge, formatFileSize } from "@/lib/trips/documents";
import { loadTripThread } from "@/lib/trips/queries";
import { formatMessageTime, groupMessagesByDay, THREAD_MESSAGES } from "@/lib/trips/thread";
import { Composer } from "./Composer";
import { THREAD } from "./content";
import { ThreadScroll } from "./ThreadScroll";

export const metadata: Metadata = { title: "Messages" };

/**
 * Screen 2.2.7 Trip Messages / Conversation Thread — docs/Screen-Inventory.md §2.2.7, §4.4
 * ("mobile is full-screen"), and design/source-prototype/screens/client-trip.jsx
 * (C227_TripThread) + client-trip-mobile.jsx (M227_TripThread). P1.
 *
 * THE SAME COMPONENT SERVES 2.6.2. §2.2.7 is this thread scoped to a trip; the Messages
 * Inbox thread is the same conversation reached from a different list. When §2.6 lands it
 * mounts this route rather than copying it, which is why nothing here reads from the trip
 * beyond its title.
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

  const days = groupMessagesByDay(thread.messages, thread.timeZone);

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
          {days.length === 0 ? (
            <EmptyState
              icon="message"
              title={THREAD_MESSAGES.emptyTitle}
              body={THREAD_MESSAGES.emptyBody}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {days.map((day) => (
                <div key={day.key} className="flex flex-col gap-3">
                  <p className="text-center">
                    <span className="chip h-[26px] bg-surface-2">{day.label}</span>
                  </p>

                  {day.messages.map((message) => {
                    const mine = message.sender === "client";
                    return (
                      <div
                        key={message.id}
                        className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}
                      >
                        {!mine && (
                          <span
                            aria-hidden="true"
                            className="t-label inline-flex h-[26px] w-[26px] shrink-0 items-end justify-center self-end rounded-full bg-brand-orange text-[10px] font-bold leading-[26px] text-white"
                          >
                            GS
                          </span>
                        )}

                        <div className="max-w-[78%] md:max-w-[70%]">
                          <div
                            className={
                              mine
                                ? "t-body rounded-[18px_18px_4px_18px] bg-primary px-3.5 py-2.5 text-on-primary"
                                : "t-body rounded-[18px_18px_18px_4px] border border-outline-variant bg-surface px-3.5 py-2.5 text-on-surface"
                            }
                          >
                            {/* `whitespace-pre-line` so the paragraph breaks somebody typed
                                survive. The compose bar accepts shift+enter; swallowing
                                those on the way back out would be a quiet edit of their
                                words. */}
                            <p className="whitespace-pre-line">{message.body}</p>
                          </div>

                          {message.attachments.length > 0 && (
                            <ul
                              className={`mt-1.5 flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
                            >
                              {message.attachments.map((attachment) => (
                                <li
                                  key={attachment.id}
                                  className="t-body-s inline-flex max-w-full items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-2 py-1"
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`t-label inline-flex h-4 w-3.5 shrink-0 items-center justify-center rounded-[2px] text-[6px] font-extrabold text-white ${
                                      documentBadge(attachment.mimeType) === "PDF"
                                        ? "bg-brand-burgundy"
                                        : "bg-brand-orange"
                                    }`}
                                  >
                                    {documentBadge(attachment.mimeType)}
                                  </span>
                                  {/* Not a link. Opening an attachment needs a signature,
                                      and the place that already does that properly — audit
                                      row and all — is the document library. Sending the
                                      traveler there beats a second signer call site. */}
                                  <Link
                                    href={`/trips/${tripId}/documents`}
                                    className="truncate underline decoration-outline-variant"
                                  >
                                    {attachment.filename}
                                  </Link>
                                  <span className="shrink-0 text-on-surface-variant">
                                    {formatFileSize(attachment.sizeBytes)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <p
                            className={`t-label mt-1 text-[11px] text-on-surface-variant ${
                              mine ? "text-right" : "text-left"
                            }`}
                          >
                            {formatMessageTime(message.createdAt, thread.timeZone)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </ThreadScroll>

      <Composer tripId={tripId} />
    </div>
  );
}
