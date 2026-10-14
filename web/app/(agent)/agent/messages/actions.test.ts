// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/** §3.10 Stage 1's server actions: what they send to `agent-message`, and what they answer. */

const mocks = vi.hoisted(() => ({ callAgentFunction: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/agent/api", () => ({ callAgentFunction: mocks.callAgentFunction }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { markThreadReadAction, sendAgentMessageAction, setThreadsArchivedAction } from "./actions";

const SEEN = "2026-10-13T14:02:11.123456+00:00";

beforeEach(() => vi.clearAllMocks());

describe("sendAgentMessageAction", () => {
  it("into a thread sends only the thread; to a client, the client and trip; always the id and the note flag", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { conversationId: "c1" } });
    await expect(
      sendAgentMessageAction({ conversationId: "c1", messageId: "m1", seenUpTo: SEEN, body: "hi", internalNote: true }),
    ).resolves.toEqual({ ok: true, conversationId: "c1" });
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-message", {
      op: "send",
      messageId: "m1",
      body: "hi",
      internalNote: true,
      seenUpTo: SEEN,
      conversationId: "c1",
    });

    await sendAgentMessageAction({ clientId: "k1", tripId: null, messageId: "m2", seenUpTo: null, body: "hi", internalNote: false });
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-message", {
      op: "send",
      messageId: "m2",
      body: "hi",
      internalNote: false,
      clientId: "k1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/messages", "layout");
  });

  it("passes the function's own sentence through, and never claims a send it cannot place", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "rejected", detail: "Start the thread with a message they can read." });
    await expect(
      sendAgentMessageAction({ clientId: "k1", messageId: "m1", seenUpTo: null, body: "x", internalNote: true }),
    ).resolves.toEqual({ ok: false, message: "Start the thread with a message they can read." });
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: {} });
    await expect(
      sendAgentMessageAction({ conversationId: "c1", messageId: "m1", seenUpTo: SEEN, body: "x", internalNote: false }),
    ).resolves.toEqual({ ok: false, message: "That didn't send. Try again in a moment." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("read and archive", () => {
  it("reads up to the newest message shown, and reports a read only when a count moved", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { changed: false } });
    await expect(markThreadReadAction("c1", SEEN)).resolves.toEqual({ changed: false });
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-message", { op: "read", conversationId: "c1", seenUpTo: SEEN });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { changed: true } });
    await expect(markThreadReadAction("c1", SEEN)).resolves.toEqual({ changed: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agent/messages", "layout");
  });

  it("archives a selection, or brings one back, and says how many moved", async () => {
    mocks.callAgentFunction.mockResolvedValue({ ok: true, data: { moved: 2 } });
    await expect(setThreadsArchivedAction(["c1", "c2"], true)).resolves.toEqual({ ok: true, moved: 2 });
    await setThreadsArchivedAction(["c3"], false);
    expect(mocks.callAgentFunction).toHaveBeenLastCalledWith("agent-message", { op: "archive", conversationIds: ["c3"], archived: false });
    mocks.callAgentFunction.mockResolvedValue({ ok: false, kind: "unavailable" });
    await expect(setThreadsArchivedAction(["c1"], true)).resolves.toEqual({ ok: false, message: "That didn't save. Try again in a moment." });
  });
});
