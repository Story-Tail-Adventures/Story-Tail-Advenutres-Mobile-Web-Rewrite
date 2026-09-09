"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The thread's scroll region, opened at the newest message.
 *
 * A thread that opens at the top shows a traveler the oldest thing Gyasi said and asks them
 * to scroll to find out what is actually happening. Every messaging surface they already use
 * opens at the bottom, and this one has to as well.
 *
 * WHY A CLIENT COMPONENT FOR THIS. There is no CSS that scrolls a region to its end:
 * `justify-end` pins short content to the bottom but does nothing once the content overflows,
 * and `flex-col-reverse` gets there only by reversing the message order, which inverts the
 * reading order for a screen reader and breaks the date separators. So the scroll position is
 * set imperatively, and this wrapper is the smallest thing that can do it — the messages
 * themselves stay server-rendered children.
 *
 * `useEffect` here measures and writes the DOM rather than setting state, which is what the
 * hook is actually for; `react-hooks/set-state-in-effect` is about the other thing.
 *
 * `behavior: "instant"` on mount, because a smooth scroll from the top would animate the
 * whole history past the traveler every time they open the thread. `messageCount` in the
 * dependency list re-runs it after a send, so a new message scrolls into view.
 */
export function ThreadScroll({
  messageCount,
  children,
}: {
  messageCount: number;
  children: ReactNode;
}) {
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = region.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, [messageCount]);

  return (
    <div
      ref={region}
      // `min-h-0` is what lets this shrink below its content inside the flex column instead
      // of pushing the compose bar off the bottom. See the note in page.tsx.
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"
    >
      {children}
    </div>
  );
}
