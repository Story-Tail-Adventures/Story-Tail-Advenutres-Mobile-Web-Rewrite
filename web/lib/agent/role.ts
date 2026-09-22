import type { OnboardingStatus } from "@/lib/onboarding/status";

export const CLIENT_SHELL_ROOT = "/dashboard";
export const AGENT_SHELL_ROOT = "/agent";

/**
 * What a shell should do with the caller in front of it.
 *
 * Pure, and separate from either layout, for the reason `authRedirectFor` was split out of
 * `updateSession`: this is the riskiest logic in §3.2 — two shells that can each redirect to
 * the other — and it needs testing without a Supabase client.
 */
export type ShellDecision =
  | { kind: "render" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" };

const RENDER: ShellDecision = { kind: "render" };
const UNAUTHORIZED: ShellDecision = { kind: "unauthorized" };

/**
 * ── FAILING OPEN NOW HAS A DIRECTION, AND THAT IS THE SECURITY PROPERTY ──────────
 *
 * `onboardingStatus()` returns null when the read fails or Supabase is not configured, and
 * the (client) layout has always treated that as "render anyway" — locking a traveler out of
 * their own dashboard because a query timed out is worse than the alternative. That reasoning
 * was written when there was one shell. With two, open has a direction, and the safe one is
 * the CLIENT shell:
 *
 *   a client who lands on the worklist by accident sees another person's pipeline;
 *   an agent who lands on the client dashboard sees an empty one and a way back.
 *
 * So a null status renders on `/dashboard` and REDIRECTS from `/agent`. Do not "fix" this
 * into symmetry.
 *
 * ── ADMIN IS A THIRD ANSWER, NOT "NOT A CLIENT" ──────────────────────────────────
 *
 * `platform_user`'s CHECK permits `role = 'admin'` with neither a client_id nor an agent_id,
 * so every read on either side returns nothing for them — and `current_agent_id()` returns
 * NULL for an admin deliberately, so routing them to the worklist would be the same dead end
 * on a surface never designed for them. They keep today's behaviour: the unauthorized state,
 * on both sides. §3.9 is agent tooling for helping clients, not an admin console; when one
 * exists this is the line that changes.
 */
export function clientShellDecision(status: OnboardingStatus | null): ShellDecision {
  if (!status) return RENDER;
  switch (status.role) {
    case "client":
      return RENDER;
    case "agent":
      // The change §3.2 makes. The (client) layout used to render an UnauthorizedState here
      // because "sending them to an agent route that does not exist yet would be a redirect
      // to a 404". That route exists now.
      return { kind: "redirect", to: AGENT_SHELL_ROOT };
    case "admin":
      return UNAUTHORIZED;
  }
}

export function agentShellDecision(status: OnboardingStatus | null): ShellDecision {
  if (!status) return { kind: "redirect", to: CLIENT_SHELL_ROOT };
  switch (status.role) {
    case "agent":
      return RENDER;
    case "client":
      return { kind: "redirect", to: CLIENT_SHELL_ROOT };
    case "admin":
      return UNAUTHORIZED;
  }
}
