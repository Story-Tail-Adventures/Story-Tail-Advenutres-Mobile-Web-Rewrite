import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

/** §3.10.2: opening a thread reads it, up to the newest message shown, once per newest message. */

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/actions", () => ({ markThreadReadAction: mocks.read }));

import { ThreadOpened } from "./ThreadOpened";

const T1 = "2026-10-13T14:02:11.123456+00:00";
const T2 = "2026-10-13T15:00:00.000001+00:00";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ changed: true });
});

describe("ThreadOpened", () => {
  it("reads the thread once up to the newest message, and brings that message into view", async () => {
    const target = document.createElement("div");
    target.id = "msg-m9";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    const { rerender } = render(<ThreadOpened conversationId="c1" lastMessageId="m9" seenUpTo={T1} />);
    rerender(<ThreadOpened conversationId="c1" lastMessageId="m9" seenUpTo={T1} />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    expect(mocks.read).toHaveBeenCalledWith("c1", T1);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "end" });
    target.remove();
  });

  it("reads again when a newer message is on screen, or another thread opens", async () => {
    const { rerender } = render(<ThreadOpened conversationId="c1" lastMessageId="m1" seenUpTo={T1} />);
    rerender(<ThreadOpened conversationId="c1" lastMessageId="m2" seenUpTo={T2} />);
    rerender(<ThreadOpened conversationId="c2" lastMessageId="m2" seenUpTo={T2} />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
    expect(mocks.read.mock.calls).toEqual([["c1", T1], ["c1", T2], ["c2", T2]]);
  });

  it("an empty thread reads nothing, and a failed read is not an error on screen", async () => {
    render(<ThreadOpened conversationId="c1" lastMessageId={null} seenUpTo={null} />);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValueOnce(new Error("offline"));
    render(<ThreadOpened conversationId="c3" lastMessageId="m1" seenUpTo={T1} />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
  });
});
