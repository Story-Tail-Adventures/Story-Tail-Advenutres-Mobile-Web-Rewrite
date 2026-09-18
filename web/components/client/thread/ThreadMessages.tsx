import Link from "next/link";

import { EmptyState } from "@/components/client/states";
import { documentBadge, formatFileSize } from "@/lib/trips/documents";
import type { ThreadMessage } from "@/lib/trips/queries";
import { formatMessageTime, groupMessagesByDay, THREAD_MESSAGES } from "@/lib/trips/thread";

/**
 * The bubbles, the day separators and the attachment chips — everything between the header
 * and the compose bar.
 *
 * THE EXTRACTION IS A DESIGN REQUIREMENT, not a tidy-up. `client-messaging-mobile.jsx` says
 * it outright: 2.6.2 "is not a new screen — it is M227_TripThread with a different header",
 * drawn to match "so that both builds mount one component instead of copying it. If the two
 * drift visually, the extraction never happens." 2.2.7's own page header had already promised
 * the same thing. This is that promise kept: the two screens now differ in their header, in
 * which action the composer is bound to, and in nothing else.
 *
 * Still a server component. Only the scroll position and the compose bar need the client.
 */
export function ThreadMessages({
  messages,
  timeZone,
  documentsHref,
  emptyBody = THREAD_MESSAGES.emptyBody,
}: {
  messages: ThreadMessage[];
  /** The traveler's own IANA zone. See `lib/trips/thread.ts` for why this is not ambient. */
  timeZone: string;
  /**
   * Where an attachment sends somebody. A trip thread has a trip library to open; the general
   * thread does not, and goes to the account-wide one (2.5.4).
   */
  documentsHref: string;
  /**
   * Overridden by the general thread, whose default would read "you and Gyasi talk about this
   * trip" on a conversation that has no trip. See MESSAGES.threadEmptyBody for why an empty
   * thread is reachable at all.
   */
  emptyBody?: string;
}) {
  const days = groupMessagesByDay(messages, timeZone);

  if (days.length === 0) {
    return <EmptyState icon="message" title={THREAD_MESSAGES.emptyTitle} body={emptyBody} />;
  }

  return (
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
                    {/* `whitespace-pre-line` so the paragraph breaks somebody typed survive.
                        The compose bar accepts shift+enter; swallowing those on the way back
                        out would be a quiet edit of their words. */}
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
                          {/* Not a link to the file. Opening an attachment needs a signature,
                              and the place that already does that properly — audit row and
                              all — is the document library. Sending the traveler there beats
                              a second signer call site. */}
                          <Link
                            href={documentsHref}
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
                    {formatMessageTime(message.createdAt, timeZone)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
