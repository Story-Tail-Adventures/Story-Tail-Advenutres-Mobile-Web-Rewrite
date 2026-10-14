import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithTheme } from "@/test/render";
import { emotionRulesFor } from "@/test/emotion-css";

/**
 * A3101's frame, pinned from the CSS emotion generated: two panes side by side from `lg`;
 * below it, the list on the inbox itself and the other pane anywhere below it. Every pane
 * scrolls on its own inside the viewport less the bars, so nothing sits behind the phone's
 * bottom bar.
 */

const mocks = vi.hoisted(() => ({ segment: null as string | null }));
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => mocks.segment }));

import { AgentMessagesFrame } from "./AgentMessagesFrame";

function frame(segment: string | null) {
  mocks.segment = segment;
  const r = renderWithTheme(
    <AgentMessagesFrame list={<span>LIST</span>}>
      <span>PANE</span>
    </AgentMessagesFrame>,
  );
  const list = emotionRulesFor(screen.getByText("LIST").parentElement!);
  const pane = emotionRulesFor(screen.getByText("PANE").parentElement!);
  const grid = emotionRulesFor(screen.getByText("LIST").parentElement!.parentElement!);
  r.unmount();
  return { list, pane, grid };
}

describe("AgentMessagesFrame", () => {
  it("on the inbox, a narrow screen shows the list; from lg, both", () => {
    const { list, pane } = frame(null);
    expect(list.base).toMatch(/display:block/);
    expect(pane.base).toMatch(/display:none/);
    expect(list.media["(min-width:1024px)"]).toMatch(/display:block/);
    expect(pane.media["(min-width:1024px)"]).toMatch(/display:block/);
  });

  it("in a thread (or a new message), a narrow screen shows the thread", () => {
    const { list, pane } = frame("0195a2c0-1a00-7000-8000-0000000000b0");
    expect(list.base).toMatch(/display:none/);
    expect(pane.base).toMatch(/display:block/);
  });

  it("each pane scrolls on its own, in the viewport less the top bar and, on a phone, the bottom bar", () => {
    const { list, pane, grid } = frame(null);
    expect(list.base).toMatch(/overflow-y:auto/);
    expect(pane.base).toMatch(/overflow-y:auto/);
    // Or a visually hidden label inside escapes the pane and the page grows a scrollbar.
    expect(list.base).toMatch(/position:relative/);
    expect(pane.base).toMatch(/position:relative/);
    expect(grid.base).toMatch(/height:calc\(100dvh - var\(--client-topbar-h\) - 68px - max\(env\(safe-area-inset-bottom\), 8px\)\)/);
    expect(grid.media["(min-width:768px)"]).toMatch(/height:calc\(100dvh - var\(--client-topbar-h\)\)/);
  });
});
