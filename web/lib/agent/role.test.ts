import { describe, expect, it } from "vitest";

import type { OnboardingStatus, PlatformRole } from "@/lib/onboarding/status";
import {
  AGENT_SHELL_ROOT,
  CLIENT_SHELL_ROOT,
  agentMfaRedirect,
  agentShellDecision,
  clientShellDecision,
} from "./role";

function status(role: PlatformRole): OnboardingStatus {
  return { role, isClient: role === "client", completedAt: "2026-09-01T00:00:00Z", step: null };
}

const ROLES: PlatformRole[] = ["client", "agent", "admin"];

describe("the two-way shell gate", () => {
  it("sends a client to the client shell and an agent to the agent shell", () => {
    expect(clientShellDecision(status("client"))).toEqual({ kind: "render" });
    expect(agentShellDecision(status("agent"))).toEqual({ kind: "render" });
  });

  it("redirects each role away from the shell that is not theirs", () => {
    expect(clientShellDecision(status("agent"))).toEqual({
      kind: "redirect",
      to: AGENT_SHELL_ROOT,
    });
    expect(agentShellDecision(status("client"))).toEqual({
      kind: "redirect",
      to: CLIENT_SHELL_ROOT,
    });
  });

  it("gives an admin the unauthorized state on BOTH sides", () => {
    // Not a redirect to either shell: every read on either side returns nothing for an
    // admin, and current_agent_id() refuses them by design. A dead end with an explanation
    // beats a dead end without one.
    expect(clientShellDecision(status("admin"))).toEqual({ kind: "unauthorized" });
    expect(agentShellDecision(status("admin"))).toEqual({ kind: "unauthorized" });
  });

  it("fails open TOWARD THE CLIENT SHELL when the role cannot be read", () => {
    // The security-relevant asymmetry. A null status means the read failed, and the (client)
    // layout has always rendered anyway rather than lock a traveler out. With two shells that
    // has a direction: rendering the agent shell on a failed read would put an unknown
    // visitor in front of somebody else's book.
    expect(clientShellDecision(null)).toEqual({ kind: "render" });
    expect(agentShellDecision(null)).toEqual({ kind: "redirect", to: CLIENT_SHELL_ROOT });
  });

  it("cannot produce a redirect loop for any role", () => {
    // Two gates that can each send somebody to the other is the failure this test exists
    // for. For every role, and for the null case, following the redirect must land on a
    // shell that RENDERS rather than bouncing back.
    const decide = {
      [CLIENT_SHELL_ROOT]: clientShellDecision,
      [AGENT_SHELL_ROOT]: agentShellDecision,
    } as const;

    for (const s of [null, ...ROLES.map(status)]) {
      for (const [from, gate] of Object.entries(decide)) {
        const first = gate(s);
        if (first.kind !== "redirect") continue;
        expect(first.to).not.toBe(from);
        const second = decide[first.to as keyof typeof decide](s);
        expect(second.kind, `${s?.role ?? "null"} bounced between shells`).not.toBe("redirect");
      }
    }
  });

  it("every role gets exactly one decision from each gate", () => {
    // A switch without a default: adding a fourth `user_role` value must fail the type
    // check rather than fall through to undefined at runtime.
    for (const s of ROLES.map(status)) {
      expect(clientShellDecision(s)).toBeDefined();
      expect(agentShellDecision(s)).toBeDefined();
    }
  });
});

describe("agentMfaRedirect", () => {
  it("lets an aal2 advisor into the shell", () => {
    expect(agentMfaRedirect("aal2", "aal2")).toBeNull();
  });

  it("sends an advisor with a factor but no code this session to the challenge", () => {
    expect(agentMfaRedirect("aal1", "aal2")).toBe("/login/mfa?next=%2Fagent");
  });

  it("sends an advisor with no factor at all to setup", () => {
    expect(agentMfaRedirect("aal1", "aal1")).toBe("/mfa/setup?next=%2Fagent");
  });

  it("fails closed to setup when the level could not be read", () => {
    // An empty shell over a server that refuses everything is the worse failure.
    expect(agentMfaRedirect(undefined, undefined)).toBe("/mfa/setup?next=%2Fagent");
    expect(agentMfaRedirect(null, null)).toBe("/mfa/setup?next=%2Fagent");
  });

  it("never sends anyone back into the agent shell it is guarding", () => {
    for (const [c, n] of [["aal1", "aal1"], ["aal1", "aal2"], [null, null]] as const) {
      expect(agentMfaRedirect(c, n)?.startsWith("/agent")).toBe(false);
    }
  });
});
