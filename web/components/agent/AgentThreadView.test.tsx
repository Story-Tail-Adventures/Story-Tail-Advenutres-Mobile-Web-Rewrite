import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * §3.10.2's thread: the advisor's own words on the right, the client's on the left, an
 * internal note that cannot be mistaken for either, and the header's archive.
 */

const mocks = vi.hoisted(() => ({ read: vi.fn(), archive: vi.fn(), send: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/actions", () => ({
  markThreadReadAction: mocks.read,
  setThreadsArchivedAction: mocks.archive,
  sendAgentMessageAction: mocks.send,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }));

import { AgentThreadView } from "./AgentThreadView";
import { EMPTY_INBOX_QUERY } from "@/lib/agent/messageQuery";
import type { ThreadView } from "@/lib/agent/messages";
import { renderWithTheme } from "@/test/render";

const THREAD: ThreadView = {
  header: {
    conversationId: "c1",
    clientId: "k1",
    clientName: "Maya Carter",
    clientFirstName: "Maya",
    tripId: "t1",
    tripLabel: "Sandals · Jul",
    overdue: false,
    replyByLabel: "Reply by end of Tue",
    archived: false,
    clientCanSignIn: true,
  },
  messages: [
    { id: "m1", sender: "client", body: "Can we upgrade?", createdAt: "2026-10-12T18:00:00Z", internalNote: false, attachments: [], emailed: false, byEmail: true },
    { id: "m2", sender: "agent", body: "Margin is 14% on this one", createdAt: "2026-10-12T18:05:00Z", internalNote: true, attachments: [], emailed: false, byEmail: false },
    { id: "m3", sender: "agent", body: "Yes, it's yours", createdAt: "2026-10-12T18:10:00.123456Z", internalNote: false, attachments: [], emailed: true, byEmail: false },
  ],
  timeZone: "America/New_York",
  truncated: false,
  seenUpTo: "2026-10-12T18:10:00.123456Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ changed: false });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("AgentThreadView", () => {
  it("says who said each message, and labels the internal note every time", () => {
    renderWithTheme(<AgentThreadView thread={THREAD} query={EMPTY_INBOX_QUERY} />);
    expect(screen.getByText("Can we upgrade?").closest("p")).toHaveTextContent("Maya: Can we upgrade?");
    expect(screen.getByText("Yes, it's yours").closest("p")).toHaveTextContent("You: Yes, it's yours");
    const note = document.getElementById("msg-m2")!;
    expect(within(note).getByText(/Internal note · only you can see this/)).toBeInTheDocument();
    expect(within(note).getByText("Margin is 14% on this one")).toBeInTheDocument();
  });

  it("marks a reply an email carried, and a client message that came by email (§3.10 Stage 4)", () => {
    renderWithTheme(<AgentThreadView thread={THREAD} query={EMPTY_INBOX_QUERY} />);
    expect(document.getElementById("msg-m3")).toHaveTextContent(/· Emailed/);
    expect(document.getElementById("msg-m1")).toHaveTextContent(/· By email/);
    // A note is never emailed, and says nothing about it.
    expect(document.getElementById("msg-m2")).not.toHaveTextContent(/Emailed|By email/);
  });

  it("reads the thread up to its newest message when it opens", async () => {
    renderWithTheme(<AgentThreadView thread={THREAD} query={EMPTY_INBOX_QUERY} />);
    await waitFor(() => expect(mocks.read).toHaveBeenCalledWith("c1", "2026-10-12T18:10:00.123456Z"));
  });

  it("the messages scroll on their own, and the reply box is outside them", () => {
    renderWithTheme(<AgentThreadView thread={THREAD} query={EMPTY_INBOX_QUERY} />);
    const log = screen.getByRole("region", { name: "Messages" });
    expect(log).toHaveAttribute("tabindex", "0");
    expect(within(log).queryByRole("form")).toBeNull();
    expect(screen.getByRole("form", { name: "Reply" })).toBeInTheDocument();
  });

  it("archives from the header, says it did, and marks an archived thread", async () => {
    const user = userEvent.setup();
    mocks.archive.mockResolvedValue({ ok: true, moved: 1 });
    const { rerender } = renderWithTheme(<AgentThreadView thread={THREAD} query={EMPTY_INBOX_QUERY} />);
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(mocks.archive).toHaveBeenCalledWith(["c1"], true);
    await waitFor(() => expect(screen.getByText("Archived", { selector: "[role=status]" })).toBeInTheDocument());

    rerender(<AgentThreadView thread={{ ...THREAD, header: { ...THREAD.header, archived: true } }} query={EMPTY_INBOX_QUERY} />);
    expect(screen.getByRole("button", { name: "Move to inbox" })).toBeInTheDocument();
    expect(screen.getByText("Archived", { selector: ".MuiChip-label" })).toBeInTheDocument();
  });
});
