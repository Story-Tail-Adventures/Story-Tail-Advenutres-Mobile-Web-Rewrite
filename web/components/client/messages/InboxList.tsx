"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages/content";
import { filterRows, type InboxRow } from "@/lib/messages/inbox";

/**
 * Screen 2.6.1's thread list — the master pane, and the whole screen below `web:`.
 *
 * A CLIENT COMPONENT ONLY BECAUSE OF THE SEARCH BOX. The rows arrive pre-formatted from the
 * server (see `lib/messages/inbox.ts`), so nothing in here touches a date or a time zone, and
 * the filter runs over exactly the strings on screen.
 *
 * WHAT THE DESKTOP FRAME HAS THAT THIS DOES NOT:
 *
 *  · The `All / Unread · 2 / By trip` filter chips. `conversation.client_unread_count` is
 *    granted and IS rendered as the badge below — but no runtime path in this repo ever
 *    raises it. `trip-message` sets it to 0 at creation and only ever increments the agent's
 *    side; the one place it is non-zero is `seed.sql`, which hand-writes a 2 so §2.2.3 has an
 *    unread state to show. So in a real account an "Unread" filter is a control that sorts
 *    nothing, and in a seeded one it filters a number that never changes again.
 *
 *    That is also why the planned `conversation-read` endpoint was NOT built: marking a
 *    thread read has nothing to mark until something counts. The increment and the clearing
 *    belong to the agent send path in §3.x and arrive together — the badge is ready for that
 *    day, and the chips can arrive with it. "By trip" is a grouping nobody specified beyond
 *    the chip itself.
 *
 *  · The two "System" threads. `conversation.agent_id` is NOT NULL and `user_role` is
 *    ('client','agent','admin') — there is no system sender, so those rows cannot exist.
 *    Departure 5 in `client-messaging-mobile.jsx`.
 *
 *  · Gyasi's photograph, which is a stock portrait of a stranger. Initials, everywhere.
 */
export function InboxList({
  rows,
  activeId = null,
  className = "",
}: {
  rows: InboxRow[];
  /** The open thread, for the selected row. Null on 2.6.1 itself. */
  activeId?: string | null;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const visible = filterRows(rows, query);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="shrink-0 px-4 pt-4 md:px-5">
        <h1 className="t-headline text-[22px]">{MESSAGES.title}</h1>
        <p className="t-body-s text-on-surface-variant">{MESSAGES.subtitle}</p>

        <Link
          href="/messages/new"
          className="btn btn-filled tap-44 mt-3 flex h-11 w-full justify-center"
        >
          <Icon name="message" size={15} />
          {MESSAGES.newCta}
        </Link>

        {/* Search earns its place only once there is something to search. One thread and a
            search box is furniture. */}
        {rows.length > 1 && (
          <label className="mt-3 flex h-9 items-center gap-2 rounded-full bg-surface-3 px-3 text-on-surface-variant">
            <Icon name="search" size={14} />
            <span className="sr-only">{MESSAGES.searchPlaceholder}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={MESSAGES.searchPlaceholder}
              className="t-body-s min-w-0 flex-1 bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </label>
        )}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon="message"
            title={MESSAGES.emptyTitle}
            body={MESSAGES.emptyBody}
            action={{ label: MESSAGES.emptyCta, href: "/messages/new" }}
          />
        ) : visible.length === 0 ? (
          <p className="t-body-s px-4 py-6 text-center text-on-surface-variant md:px-5">
            {MESSAGES.searchEmpty}
          </p>
        ) : (
          <ul>
            {visible.map((row) => {
              const active = row.id === activeId;
              return (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex gap-2.5 border-l-[3px] px-4 py-3 md:px-5 ${
                      active
                        ? "border-brand-orange bg-secondary-container text-on-secondary-container"
                        : "border-transparent text-on-surface hover:bg-surface-2"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="t-label inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-burgundy text-[11px] font-bold text-white"
                    >
                      {MESSAGES.advisorInitials}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="t-title-s min-w-0 flex-1 truncate">{row.title}</span>
                        <span
                          className={`t-body-s shrink-0 ${
                            active ? "" : "text-on-surface-variant"
                          }`}
                        >
                          {row.time}
                        </span>
                      </span>

                      <span
                        className={`t-body-s mt-0.5 block truncate ${
                          active ? "" : "text-on-surface-variant"
                        }`}
                      >
                        {row.preview}
                      </span>

                      {/* The trip kicker is dropped when the title IS the trip, which is the
                          common case — `trip-message` copies the trip title into `subject`,
                          and inboxTitle prefers the live trip name. Printing it twice is
                          noise. */}
                      {row.tripLabel && row.tripLabel !== row.title && (
                        <span
                          className={`t-label mt-1.5 block truncate text-[9.5px] uppercase tracking-[0.4px] ${
                            active ? "" : "text-brand-orange"
                          }`}
                        >
                          {row.tripLabel}
                        </span>
                      )}
                    </span>

                    {row.unreadCount > 0 && (
                      <span className="t-label inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange px-1.5 text-[11px] font-bold text-white">
                        {row.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
