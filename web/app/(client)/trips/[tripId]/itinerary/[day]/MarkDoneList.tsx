"use client";

import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { ITINERARY } from "../content";

/**
 * "Mark as done" for a day's activities — Screen-Inventory §2.2.5's "(optional check-in
 * feature)".
 *
 * IT IS PER-DEVICE, AND THAT IS THE DECISION. No column backs it: adding one meant a
 * Data-Model change plus a client write path to an agent-owned table, for a feature the
 * spec itself marks optional. Gyasi chose local-only on 2026-09-06.
 *
 * The honest cost, stated here because nobody will read a commit message a year from now:
 * a checkmark set on a laptop does not follow the traveler to their phone. That will look
 * like a sync bug, and it is not one.
 *
 * WHY useSyncExternalStore RATHER THAN useState + useEffect. localStorage is external state
 * the server cannot see, so reading it in an effect and calling setState means rendering
 * once with nothing ticked and again with the real value — a flash, and the exact pattern
 * `react-hooks/set-state-in-effect` exists to catch. This hook takes a server snapshot
 * explicitly, so SSR renders "none ticked", hydration agrees, and the stored value arrives
 * in the same commit.
 *
 * Every accessor is wrapped: localStorage does not merely return null in a private window
 * with site data blocked, it throws.
 */

const EMPTY = "[]";

function subscribe(onChange: () => void): () => void {
  // `storage` covers another tab; the custom event covers this one, since `storage` does
  // not fire for the writer.
  window.addEventListener("storage", onChange);
  window.addEventListener("sta:done-changed", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("sta:done-changed", onChange);
  };
}

export function MarkDoneList({
  tripId,
  dayNumber,
  children,
}: {
  tripId: string;
  dayNumber: number;
  children: ReactNode;
}) {
  // Keyed per trip AND day, so two trips cannot share checkmarks.
  const key = `sta:done:${tripId}:${dayNumber}`;
  const items = Array.isArray(children) ? children : [children];

  // The snapshot is the raw STRING, not a parsed Set: useSyncExternalStore compares
  // snapshots by identity, and a fresh object every call is an infinite render loop.
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? EMPTY;
    } catch {
      return EMPTY;
    }
  }, [key]);

  const raw = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const done = useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return new Set<number>(Array.isArray(parsed) ? (parsed as number[]) : []);
    } catch {
      return new Set<number>();
    }
  }, [raw]);

  const toggle = useCallback(
    (index: number) => {
      const next = new Set(done);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      try {
        window.localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Nothing to be done: the tick simply will not be remembered.
      }
      window.dispatchEvent(new Event("sta:done-changed"));
    },
    [done, key],
  );

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, index) => {
        const isDone = done.has(index);
        return (
          <li key={index} className={isDone ? "opacity-60" : undefined}>
            {item}
            <button
              type="button"
              className={`btn btn-sm mt-1.5 ${isDone ? "btn-tonal" : "btn-outlined"}`}
              onClick={() => toggle(index)}
              aria-pressed={isDone}
            >
              <Icon name="check" size={13} /> {isDone ? ITINERARY.markedDone : ITINERARY.markDone}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
