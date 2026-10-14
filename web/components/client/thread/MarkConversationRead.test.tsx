import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * §3.10 Stage 1: a traveler opening a thread clears their own unread count, up to the newest
 * message on screen, once per newest message, if there is one.
 */

const mocks = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("@/lib/messages/actions", () => ({ markConversationRead: mocks.mark }));

import { MarkConversationRead } from "./MarkConversationRead";

const T1 = "2026-10-13T14:02:11.123456+00:00";
const T2 = "2026-10-13T15:30:00.5+00:00";

beforeEach(() => vi.clearAllMocks());

describe("MarkConversationRead", () => {
  it("clears an unread thread once, naming the newest message shown", async () => {
    mocks.mark.mockResolvedValue(true);
    const { rerender } = render(<MarkConversationRead conversationId="c1" unreadCount={2} seenUpTo={T1} />);
    rerender(<MarkConversationRead conversationId="c1" unreadCount={2} seenUpTo={T1} />);
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(1));
    expect(mocks.mark).toHaveBeenCalledWith("c1", T1);
  });

  it("reads again when a newer message is on screen", async () => {
    mocks.mark.mockResolvedValue(true);
    const { rerender } = render(<MarkConversationRead conversationId="c1" unreadCount={1} seenUpTo={T1} />);
    rerender(<MarkConversationRead conversationId="c1" unreadCount={1} seenUpTo={T2} />);
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(2));
    expect(mocks.mark).toHaveBeenLastCalledWith("c1", T2);
  });

  it("does nothing with nothing unread, or nothing on screen", () => {
    render(<MarkConversationRead conversationId="c1" unreadCount={0} seenUpTo={T1} />);
    render(<MarkConversationRead conversationId="c1" unreadCount={3} seenUpTo={null} />);
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("swallows a failed call and tries again on the next render", async () => {
    mocks.mark.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const { rerender } = render(<MarkConversationRead conversationId="c1" unreadCount={1} seenUpTo={T1} />);
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(1));
    // Let the rejection land and reset the guard, then a re-render (new count) retries.
    await new Promise((r) => setTimeout(r, 0));
    rerender(<MarkConversationRead conversationId="c1" unreadCount={2} seenUpTo={T1} />);
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(2));
  });
});
