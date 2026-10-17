import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * §3.9 (ruled 2026-10-16). The tab draws what the snapshot allows and sends exactly the op the
 * advisor confirmed; every rule is the Edge Function's, so these check the drawing and the call.
 */

const mocks = vi.hoisted(() => ({ accountAdminAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/(agent)/agent/clients/[clientId]/actions", () => ({
  accountAdminAction: mocks.accountAdminAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ClientAccountAdminTab } from "./ClientAccountAdminTab";
import type { AccountAdminView } from "@/lib/agent/accountAdminView";
import { renderWithTheme } from "@/test/render";

const ACCOUNT: Extract<AccountAdminView, { kind: "account" }> = {
  kind: "account",
  firstName: "Jordan",
  email: "jordan@example.com",
  emailVerified: true,
  invitePending: false,
  socialOnly: null,
  hasPassword: true,
  mfaOn: true,
  locked: null,
  lastSignIn: "Today · 12:00 PM · iPhone · Safari",
  sessions: [{ id: "s1", device: "iPhone · Safari", ip: "99.244.18.4", lastActive: "Today · 1:00 PM" }],
  activity: [
    { id: "e1", when: "Today · 12:00 PM", device: "iPhone · Safari", ip: "99.244.18.4", flagged: false },
    { id: "e2", when: "May 5 · 11:42 PM", device: "Android · Chrome", ip: null, flagged: true },
  ],
  duplicate: { any: false, clientId: null },
  addressMismatch: false,
  sendsLeft: 3,
};

function draw(view: AccountAdminView) {
  return renderWithTheme(
    <ClientAccountAdminTab clientId="c1" view={view} mfaReturnTo="/agent/clients/c1?tab=account" />,
  );
}

beforeEach(() => {
  mocks.accountAdminAction.mockReset();
  mocks.refresh.mockReset();
});

describe("ClientAccountAdminTab", () => {
  it("before aal2: only the gate, pointing at setup when there is no factor", () => {
    draw({ kind: "needs-mfa", agentHasFactor: false });
    const link = screen.getByRole("link", { name: "Set up two-step sign-in" });
    expect(link).toHaveAttribute("href", "/mfa/setup?next=%2Fagent%2Fclients%2Fc1%3Ftab%3Daccount");
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
  });

  it("with a factor, the gate asks to verify", () => {
    draw({ kind: "needs-mfa", agentHasFactor: true });
    expect(screen.getByRole("link", { name: "Verify now" })).toHaveAttribute(
      "href",
      "/login/mfa?next=%2Fagent%2Fclients%2Fc1%3Ftab%3Daccount",
    );
  });

  it("no sign-in: only the invite, blocked with its reason on a duplicate", () => {
    draw({
      kind: "no-sign-in",
      firstName: "Nora",
      email: "nora@example.com",
      archived: false,
      duplicate: { any: true, clientId: "c9" },
      sendsLeft: 3,
    });
    expect(screen.getByText("Hasn't signed in yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send an invite/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Another client record has this email. Merge them first.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the other record" })).toHaveAttribute("href", "/agent/clients/c9");
    expect(screen.queryByRole("button", { name: /Send password reset/ })).toBeNull();
    // A duplicate with no sign-in is the commonest case for a merge, so the tile is here too.
    expect(screen.getByRole("link", { name: /Merge duplicate records/ })).toHaveAttribute("href", "/agent/clients/c1/merge");
  });

  it("an account: status, devices and sign-ins, and Merge opens its page", () => {
    draw(ACCOUNT);
    expect(screen.getByText("Today · 12:00 PM · iPhone · Safari")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Merge duplicate records/ })).toHaveAttribute("href", "/agent/clients/c1/merge");
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText("Flagged")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear flag: May 5 · 11:42 PM, Android · Chrome" })).toBeInTheDocument();
  });

  it("Google-only: reset is explained, not offered", () => {
    draw({ ...ACCOUNT, socialOnly: "Google", hasPassword: false });
    expect(screen.getByRole("button", { name: /Send password reset/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Signs in with Google, so there's no password to reset.")).toBeInTheDocument();
  });

  it("capped: the email buttons say why", () => {
    draw({ ...ACCOUNT, sendsLeft: 0 });
    expect(screen.getByRole("button", { name: /Send a sign-in link/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("lock needs a reason, then sends lock with it", async () => {
    mocks.accountAdminAction.mockResolvedValue({ ok: true, message: "Done." });
    draw(ACCOUNT);
    fireEvent.click(screen.getByRole("button", { name: /Lock account/ }));
    const dialog = await screen.findByRole("dialog", { name: "Lock Jordan's account?" });
    expect(dialog).toHaveTextContent("Signs them out everywhere");

    fireEvent.click(screen.getByRole("button", { name: "Lock account" }));
    expect(await screen.findByText("Add a short reason.")).toBeInTheDocument();
    expect(mocks.accountAdminAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  odd device  " } });
    fireEvent.click(screen.getByRole("button", { name: "Lock account" }));
    await waitFor(() =>
      expect(mocks.accountAdminAction).toHaveBeenCalledWith({
        clientId: "c1",
        op: "lock",
        email: "jordan@example.com",
        reason: "odd device",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Done.")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("a refusal stays in the dialog", async () => {
    mocks.accountAdminAction.mockResolvedValue({ ok: false, message: "That email didn't go out. Try again in a moment." });
    draw(ACCOUNT);
    fireEvent.click(screen.getByRole("button", { name: /Send a sign-in link/ }));
    await screen.findByRole("dialog", { name: "Send Jordan a sign-in link?" });
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That email didn't go out.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.accountAdminAction).toHaveBeenCalledWith({ clientId: "c1", op: "magic_link", email: "jordan@example.com" });
  });

  it("a blocked tile stays focusable and does nothing when pressed", () => {
    draw({ ...ACCOUNT, sendsLeft: 0 });
    const tile = screen.getByRole("button", { name: /Send a sign-in link/ });
    tile.focus();
    expect(tile).toHaveFocus();
    expect(tile).toHaveAccessibleDescription(/3 sign-in emails this hour/);
    fireEvent.click(tile);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("verify is explained, not offered, when the two addresses differ", () => {
    draw({ ...ACCOUNT, emailVerified: false, addressMismatch: true });
    expect(screen.getByRole("button", { name: /Verify email manually/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("verify needs 20 characters of how", async () => {
    draw({ ...ACCOUNT, emailVerified: false });
    fireEvent.click(screen.getByRole("button", { name: /Verify email manually/ }));
    await screen.findByRole("dialog", { name: "Mark jordan@example.com as verified?" });
    fireEvent.change(screen.getByLabelText("How you confirmed it"), { target: { value: "phoned" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark verified" }));
    expect(await screen.findByText("Say a little more about how you confirmed it.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("How you confirmed it")).toHaveFocus());
    expect(mocks.accountAdminAction).not.toHaveBeenCalled();
  });

  it("a locked account offers Unlock and blocks the emails", () => {
    draw({ ...ACCOUNT, locked: { reason: "odd device", since: "Today · 1:30 PM" } });
    expect(screen.getByText(/Locked Today · 1:30 PM\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unlock account/ })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: /Send a sign-in link/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("flag sends the sign-in's id", async () => {
    mocks.accountAdminAction.mockResolvedValue({ ok: true, message: "Done." });
    draw(ACCOUNT);
    fireEvent.click(screen.getByRole("button", { name: "Flag: Today · 12:00 PM, iPhone · Safari" }));
    await waitFor(() =>
      expect(mocks.accountAdminAction).toHaveBeenCalledWith({ clientId: "c1", op: "flag", authEventId: "e1" }),
    );
  });
});
