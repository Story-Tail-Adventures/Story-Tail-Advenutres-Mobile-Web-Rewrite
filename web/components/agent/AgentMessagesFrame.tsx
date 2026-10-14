"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import Box from "@mui/material/Box";

/**
 * A3101's two panes, as the frame of every /agent/messages route: the list (320px in the
 * artboard, 340 here so a client name and a time share a line) beside the thread, from `lg`.
 *
 * IT IS THE LAYOUT, so it stays mounted from one thread to the next: the list keeps its
 * scroll position, and only the slot contents change.
 *
 * EACH PANE SCROLLS ON ITS OWN, inside the viewport less the bars. The page itself never
 * scrolls, so the thread's reply box sits under its messages instead of floating over them,
 * and on a phone nothing hides behind the bottom bar (the shell's `main` already reserves its
 * height; this subtracts it too, as `.client-fill` does for the traveler's thread).
 *
 * Below `lg` one pane shows at a time: the list on /agent/messages, the other pane anywhere
 * below it (a thread, or a new message). The segment is known on the server too, so the
 * right pane is in the first HTML rather than swapped in after hydration.
 */
const FULL_HEIGHT = {
  xs: "calc(100dvh - var(--client-topbar-h) - 68px - max(env(safe-area-inset-bottom), 8px))",
  md: "calc(100dvh - var(--client-topbar-h))",
};

// `position: relative` makes each pane the containing block for what is positioned inside it:
// without it, a visually hidden label (`position: absolute`) escapes the scroll region and
// stretches the page by however far down the pane it sits.
const PANE_SX = { position: "relative", minHeight: 0, minWidth: 0, overflowY: "auto" } as const;

export function AgentMessagesFrame({ list, children }: { list: ReactNode; children: ReactNode }) {
  // null on /agent/messages itself; a thread id, or "new", one level below.
  const showList = useSelectedLayoutSegment() === null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "340px minmax(0, 1fr)" },
        gridTemplateRows: "minmax(0, 1fr)",
        height: FULL_HEIGHT,
      }}
    >
      <Box
        sx={{
          ...PANE_SX,
          display: { xs: showList ? "block" : "none", lg: "block" },
          borderRight: { lg: 1 },
          borderColor: { lg: "divider" },
        }}
      >
        {list}
      </Box>
      <Box sx={{ ...PANE_SX, display: { xs: showList ? "none" : "block", lg: "block" } }}>{children}</Box>
    </Box>
  );
}
