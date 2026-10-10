"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import NativeSelect from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";
import Typography from "@mui/material/Typography";

import { changeTripStage } from "@/app/(agent)/agent/pipeline/actions";
import { fieldInputSx } from "@/components/ui/Field";
import { AGENT_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

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
 *
 * ON MUI (step 2 of the migration): the control is the same real `<select>`, drawn the way
 * `components/ui/Select` draws every select in the app — MUI's NativeSelect inside an
 * OutlinedInput at the legacy 44px box (`fieldInputSx`), with MUI's stock arrow. The label
 * stays visually hidden: a stationary label above the control would add a line to every
 * card on the board, and the card's height is part of the layout this migration keeps.
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
  // THE 409 IS ITS OWN STATE, not a substring of the message. `changeTripStage` sets
  // `stale` from the typed `conflict` flag the transport carries, and until this existed
  // nothing in the repo read either that flag or `AGENT_COPY.stageStale` — a signal
  // declared, threaded through two modules and then consumed by nobody, which is the same
  // dead shape the substring match was replaced for.
  const [stale, setStale] = useState(false);

  function onChange(next: string) {
    if (next === status) return;
    setError(null);
    setStale(false);
    startTransition(async () => {
      const result = await changeTripStage({ tripId, status: next, expectedVersion: version });
      if (!result.ok) {
        setStale(result.stale === true);
        setError(result.message);
      }
    });
  }

  const id = `stage-${tripId}`;

  return (
    <Box sx={{ mt: 1 }}>
      <FormControl fullWidth disabled={pending}>
        <FormLabel htmlFor={id} sx={VISUALLY_HIDDEN}>
          {AGENT_COPY.stageMenuLabel}
        </FormLabel>
        <NativeSelect
          id={id}
          value={status}
          onChange={(e) => onChange(e.target.value)}
          input={<OutlinedInput size="small" sx={fieldInputSx} />}
        >
          {stages.map((s) => (
            <option key={s.status} value={s.status}>
              {s.label}
            </option>
          ))}
          {/* Reachable, but not a column. A cancellation needs a reason the traveler's §2.2.10
              screen can show, which this control has nowhere to collect — so it is offered
              from the trip rather than from the board. */}
        </NativeSelect>
      </FormControl>
      {/* OUR SENTENCE ON THE ONE CONDITION WE CAN NAME. A stale write is a condition this
          surface understands on its own — the board it was rendered from is out of date and
          the remedy is a reload — so it reads from `AGENT_COPY`, the module that owns every
          user-facing string here. Every other rejection keeps the Edge Function's own
          sentence, which is written next to the rule it enforces and which this side cannot
          reconstruct. The two happen to be word-for-word the same today; that coincidence is
          exactly what let the old substring match look like it worked. */}
      {error && (
        <Typography component="p" variant="body2" role="alert" sx={{ mt: 0.5, color: "error.main" }}>
          {stale ? AGENT_COPY.stageStale : error}
        </Typography>
      )}
    </Box>
  );
}

