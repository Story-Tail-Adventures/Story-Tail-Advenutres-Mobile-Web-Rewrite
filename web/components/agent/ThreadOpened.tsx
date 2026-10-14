"use client";

import { useEffect, useRef } from "react";

import { markThreadReadAction } from "@/app/(agent)/agent/messages/actions";

/**
 * What opening a thread does: brings the newest message into view, and reads the thread up to
 * that message, once per (thread, newest message).
 *
 * AN EFFECT, NOT A WRITE DURING RENDER. Marking read while the server renders the page would
 * also fire for anything that renders it without the advisor looking (a prefetch), and a
 * thread marked read that nobody read is a client question that gets missed.
 *
 * UP TO `seenUpTo`, the newest message's own `created_at`: a client message that lands after
 * the page was drawn stays unread. A re-render that shows a newer one reads again.
 *
 * No `router.refresh()`: the action revalidates the inbox when a count moves, and that
 * already re-renders the list beside the thread.
 */
export function ThreadOpened({
  conversationId,
  lastMessageId,
  seenUpTo,
}: {
  conversationId: string;
  lastMessageId: string | null;
  seenUpTo: string | null;
}) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (lastMessageId) {
      document.getElementById(`msg-${lastMessageId}`)?.scrollIntoView({ block: "end" });
    }
  }, [lastMessageId]);

  useEffect(() => {
    if (!seenUpTo) return;
    const key = `${conversationId}@${seenUpTo}`;
    if (done.current === key) return;
    done.current = key;
    // Nothing to tell the advisor if it fails: the badge stays, and the next open tries again.
    markThreadReadAction(conversationId, seenUpTo).catch(() => {
      done.current = null;
    });
  }, [conversationId, seenUpTo]);

  return null;
}
