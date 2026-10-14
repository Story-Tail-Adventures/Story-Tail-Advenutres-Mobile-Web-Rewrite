import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** §3.10.1's list: a link per thread, its state at a glance, and bulk archive. */

const mocks = vi.hoisted(() => ({ archive: vi.fn() }));
vi.mock("@/app/(agent)/agent/messages/actions", () => ({ setThreadsArchivedAction: mocks.archive }));

import { AgentInboxList } from "./AgentInboxList";
import type { InboxThread } from "@/lib/agent/messages";
import { renderWithTheme } from "@/test/render";

const THREADS: InboxThread[] = [
  { id: "c1", href: "/agent/messages/c1", clientName: "Maya Carter", tripLabel: "Sandals · Jul", preview: "Yes lock the upgrade!", timeLabel: "2:14p", unread: 2, overdue: false, replyByLabel: "Reply by Tue", archived: false },
  { id: "c2", href: "/agent/messages/c2", clientName: "Kai Traveler", tripLabel: "General", preview: "You: Here you go", timeLabel: "Oct 9", unread: 0, overdue: true, replyByLabel: null, archived: false },
];

beforeEach(() => vi.clearAllMocks());

describe("AgentInboxList", () => {
  it("links each thread, marks the open one, and shows what needs attention", () => {
    renderWithTheme(<AgentInboxList threads={THREADS} activeId="c1" archivedView={false} />);
    const maya = screen.getByRole("link", { name: /Maya Carter/ });
    expect(maya).toHaveAttribute("href", "/agent/messages/c1");
    expect(maya).toHaveAttribute("aria-current", "page");
    // The count is read as words, not a bare number.
    expect(maya).toHaveTextContent(/2 unread/);
    expect(maya).toHaveTextContent("Reply by Tue");
    expect(screen.getByRole("link", { name: /Kai Traveler/ })).toHaveTextContent("Overdue · Oct 9");
  });

  it("archives the threads ticked and says how many moved", async () => {
    const user = userEvent.setup();
    mocks.archive.mockResolvedValue({ ok: true, moved: 2 });
    renderWithTheme(<AgentInboxList threads={THREADS} archivedView={false} />);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    // Each name says which thread, not just which client: one client can have several.
    await user.click(screen.getByRole("checkbox", { name: "Select Maya Carter · Sandals · Jul" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Kai Traveler · General" }));
    expect(screen.getByRole("region", { name: "Selected threads" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 selected");
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(mocks.archive).toHaveBeenCalledWith(["c1", "c2"], true);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 archived"));
    expect(screen.queryByRole("region", { name: "Selected threads" })).toBeNull();
  });

  it("in the archived view the same bar brings threads back, and a refusal is said", async () => {
    const user = userEvent.setup();
    mocks.archive.mockResolvedValue({ ok: false, message: "That didn't save. Try again in a moment." });
    renderWithTheme(<AgentInboxList threads={THREADS} archivedView />);
    await user.click(screen.getByRole("checkbox", { name: "Select Kai Traveler · General" }));
    await user.click(screen.getByRole("button", { name: "Move to inbox" }));
    expect(mocks.archive).toHaveBeenCalledWith(["c2"], false);
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save");
    expect(screen.getByRole("checkbox", { name: "Select Kai Traveler · General" })).toBeChecked();
  });

  it("an action that throws is said, not swallowed", async () => {
    const user = userEvent.setup();
    mocks.archive.mockRejectedValue(new Error("network"));
    renderWithTheme(<AgentInboxList threads={THREADS} archivedView={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Select Maya Carter · Sandals · Jul" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save. Try again in a moment.");
  });

  it("a thread that leaves the list leaves the selection, and is not ticked if it comes back", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithTheme(<AgentInboxList threads={THREADS} archivedView={false} />);
    await user.click(screen.getByRole("checkbox", { name: "Select Maya Carter · Sandals · Jul" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Kai Traveler · General" }));
    rerender(<AgentInboxList threads={[THREADS[0]]} archivedView={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
    rerender(<AgentInboxList threads={THREADS} archivedView={false} />);
    expect(screen.getByRole("checkbox", { name: "Select Kai Traveler · General" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Maya Carter · Sandals · Jul" })).toBeChecked();
  });
});
