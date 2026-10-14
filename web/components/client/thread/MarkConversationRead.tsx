"use client";

import { useEffect, useRef } from "react";

import { markConversationRead } from "@/lib/messages/actions";

/**
 * Opening a thread reads it: clears the traveler's unread count, up to the newest message on
 * their screen (`seenUpTo`, its own `created_at`), once per (thread, newest message), and only
 * when there is something to clear. An advisor reply that lands after the page was drawn stays
 * unread.
 *
 * An effect rather than a write during render, so nothing that renders the page without the
 * traveler looking (a prefetch) marks their messages read. Mounted by 2.2.7 (the trip thread)
 * and 2.6.2 (any thread).
 *
 * No `router.refresh()`: the action revalidates, which already redraws the page it ran from.
 */
export function MarkConversationRead({
  conversationId,
  unreadCount,
  seenUpTo,
}: {
  conversationId: string;
  unreadCount: number;
  seenUpTo: string | null;
}) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount <= 0 || !seenUpTo) return;
    const key = `${conversationId}@${seenUpTo}`;
    if (done.current === key) return;
    done.current = key;
    // A failure costs nothing but the badge, which the next open clears.
    markConversationRead(conversationId, seenUpTo).catch(() => {
      done.current = null;
    });
  }, [conversationId, unreadCount, seenUpTo]);

  return null;
}
