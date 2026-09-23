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

/**
 * ── THIS GATE DOES NOT ENFORCE MFA, AND §3.1.6 SAYS IT MUST ─────────────────────
 *
 * OPEN, NOT CLOSED. This block is a RECORD of a gap, not a fix for one — the function below
 * still branches on role and nothing else, exactly as it did before the block was written.
 * A review round once listed this under "fixed" on the strength of the comment alone; it is
 * spelled out here so the next reader cannot make the same mistake. The section that closes
 * it is §3.1.6, named again at the end of this comment.
 *
 * Screen Inventory §3.1.6 "Mandatory MFA Setup (Agents)" reads: "Force MFA enrollment
 * before the agent can access any client data — non-skippable for agent role." The worklist
 * IS that data. This gate sees a role and nothing else — no assurance level, no
 * `account.mfa_required` — so an agent with no second factor enrolled signs in at aal1 and
 * renders. The proxy does not cover it either: `authRedirectFor` forces /login/mfa only
 * when assurance is already "required", which means a factor exists and the session has not
 * been challenged. An agent with NO factor is "none" and passes straight through.
 *
 * DEFERRED ON PURPOSE, RECORDED HERE SO IT IS NOT REDISCOVERED AS A SURPRISE. §3.1 — the
 * agent activation flow, and §3.1.6 specifically — is the section that enrols the factor and
 * owns the forced redirect; there is no invitation or activation path in the product yet, so
 * a hard gate here would lock out the only agent account that exists. /mfa/setup does work
 * today for any signed-in user, so an agent can enrol by typing the URL; what is missing is
 * the requirement, not the screen.
 *
 * WHEN §3.1.6 LANDS, THE LAYOUT IS NOT ENOUGH. The five §3.2 accessors are granted to
 * `authenticated` with no `aal` predicate, so an aal1 session can read the same rows
 * straight off PostgREST. The check belongs in `current_agent_id()` (or each accessor) as
 * well as here.
 */
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
