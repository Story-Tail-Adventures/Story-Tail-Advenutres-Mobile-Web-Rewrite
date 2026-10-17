import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * §3.9.7 / §3.3.11 (ruled 2026-10-16). The picker sends exactly the flips the advisor made, the
 * confirm step says what moves and that there is no undo or email, and a success opens the kept
 * record. Every rule is the Edge Function's.
 */

const mocks = vi.hoisted(() => ({ mergeClientsAction: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(agent)/agent/clients/[clientId]/merge/actions", () => ({
  mergeClientsAction: mocks.mergeClientsAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

import { ClientMergeForm } from "./ClientMergeForm";
import { MERGE_COPY as C } from "@/lib/agent/content";
import type { MergeView } from "@/lib/agent/mergeView";
import { renderWithTheme } from "@/test/render";

const VIEW: Extract<MergeView, { kind: "preview" }> = {
  kind: "preview",
  keep: { clientId: "k1", name: "Maya Carter", firstName: "Maya", version: 3, line: "1 trip · joined Mar 2024", signIn: "No sign-in", archived: false },
  retire: { clientId: "r1", name: "Maya Carter-Reyes", firstName: "Maya", version: 7, line: "3 trips · joined Apr 2024", signIn: "Signs in as m@example.com", archived: false },
  fields: [
    { field: "phone", label: "Phone", keep: "305-555-0100", retire: "305-555-0199", pick: "keep", pinned: false },
    { field: "email", label: "Email", keep: "maya@example.com", retire: "m@example.com", pick: "retire", pinned: true },
  ],
  sameCount: 4,
  moves: "3 trips, 2 conversations, 5 notes",
  plan: C.planMove("Maya"),
  blocked: null,
};

beforeEach(() => {
  mocks.mergeClientsAction.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
});

describe("ClientMergeForm", () => {
  it("shows both records, the swap, and only the details that differ", () => {
    renderWithTheme(<ClientMergeForm view={VIEW} />);
    expect(screen.getByText("Maya Carter-Reyes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: C.swap })).toHaveAttribute("href", "/agent/clients/r1/merge?with=k1");
    expect(screen.getByRole("radio", { name: "Phone: use 305-555-0100" })).toBeChecked();
    expect(screen.getByText(C.sameCount(4))).toBeInTheDocument();
    // The email is fixed to the sign-in: no choice to make.
    expect(screen.queryByRole("radio", { name: /Email/ })).toBeNull();
    expect(screen.getByText(C.pinned)).toBeInTheDocument();
  });

  it("confirms with the counts and no-undo note, then sends only the flip", async () => {
    mocks.mergeClientsAction.mockResolvedValue({ ok: true, keptClientId: "k1" });
    renderWithTheme(<ClientMergeForm view={VIEW} />);

    fireEvent.click(screen.getByRole("radio", { name: "Phone: use 305-555-0199" }));
    fireEvent.click(screen.getByRole("button", { name: C.review }));

    const dialog = screen.getByRole("dialog", { name: C.confirmTitle("Maya Carter") });
    expect(dialog).toHaveTextContent(C.confirmMoves("3 trips, 2 conversations, 5 notes", "Maya Carter-Reyes"));
    expect(dialog).toHaveTextContent(C.noUndo);
    expect(dialog).toHaveTextContent(C.noEmail);
    expect(dialog).toHaveTextContent(C.planMove("Maya"));
    expect(dialog).toHaveTextContent("305-555-0199");

    fireEvent.click(screen.getByRole("button", { name: C.confirm }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/agent/clients/k1"));
    expect(mocks.mergeClientsAction).toHaveBeenCalledWith({
      keepId: "k1",
      otherId: "r1",
      keepVersion: 3,
      otherVersion: 7,
      choices: { phone: "retire" },
    });
  });

  it("a refusal stays in the dialog", async () => {
    mocks.mergeClientsAction.mockResolvedValue({ ok: false, message: C.stale });
    renderWithTheme(<ClientMergeForm view={VIEW} />);
    fireEvent.click(screen.getByRole("button", { name: C.review }));
    fireEvent.click(screen.getByRole("button", { name: C.confirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent(C.stale);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a blocked merge cannot be reviewed", () => {
    renderWithTheme(<ClientMergeForm view={{ ...VIEW, blocked: C.blockedArchived }} />);
    expect(screen.getByText(C.blockedArchived)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: C.review })).toBeDisabled();
  });
});
