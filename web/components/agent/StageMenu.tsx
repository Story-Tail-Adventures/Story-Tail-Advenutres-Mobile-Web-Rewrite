"use client";

import { useState, useTransition } from "react";

import { changeTripStage } from "@/app/(agent)/agent/pipeline/actions";
import { AGENT_COPY } from "@/lib/agent/content";

/**
 * Moving a trip between stages.
 *
 * A MENU, NOT DRAG-AND-DROP, and the spec permits either ("drag-and-drop or status-change
 * menu", §3.2.2). Four reasons, in order of weight:
 *
 *  1. The menu is mandatory anyway. §4.4 collapses the board to a stage-picker on mobile and
 *     scrolls it on tablet, so two of three viewports need a non-drag control regardless.
 *     Drag would be a second interaction model, not the only one.
 *  2. WCAG 2.2 SC 2.5.7 requires a single-pointer alternative for every drag, and BRD §11
 *     commits to AA. A native menu is keyboard, screen-reader and touch operable with no
 *     ARIA authoring; @dnd-kit's accessibility needs hand-written live regions.
 *  3. `web/package.json` has six runtime dependencies and not one UI library — every
 *     component in components/ui is hand-rolled from the prototype. A drag library for one
 *     interaction on one screen for one user would be the first.
 *  4. A drop has no confirmation. Moving a trip to `booked` is what §3.7's commission entry
 *     hangs off; a mis-drop between adjacent columns is silent, where a menu names the
 *     destination in words.
 *
 * Recorded as a departure from the artboard, which draws `cursor: grab` and subtitles the
 * screen "Drag a card to change its stage."
 *
 * THE SERVER ACTION IS IMPORTED, NOT PASSED AS A PROP. Both work — Next serialises an action
 * reference — but an import is the one a future refactor cannot turn into a closure, and a
 * plain function in a `"use client"` prop object typechecks, passes every test and throws at
 * runtime.
 */
export function StageMenu({
  tripId,
  status,
  version,
  stages,
}: {
  tripId: string;
  status: string;
  version: number;
  stages: readonly { status: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      const result = await changeTripStage({ tripId, status: next, expectedVersion: version });
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="mt-2">
      <label className="sr-only" htmlFor={`stage-${tripId}`}>
        {AGENT_COPY.stageMenuLabel}
      </label>
      <select
        id={`stage-${tripId}`}
        className="input min-h-11 w-full text-sm"
        value={status}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        {stages.map((s) => (
          <option key={s.status} value={s.status}>
            {s.label}
          </option>
        ))}
        {/* Reachable, but not a column. A cancellation needs a reason the traveler's §2.2.10
            screen can show, which this control has nowhere to collect — so it is offered
            from the trip rather than from the board. */}
      </select>
      {error && (
        <p className="t-body-s mt-1 text-[var(--md-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
