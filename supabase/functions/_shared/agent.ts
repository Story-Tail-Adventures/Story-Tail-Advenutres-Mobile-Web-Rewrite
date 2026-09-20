/**
 * The agent side's counterpart to `_shared/trip.ts`.
 *
 * §3.x routes are the first in this codebase that serve an agent rather than a traveler, and
 * the two sides need the same two guarantees in mirror image: the caller is who they claim to
 * be, and the row they named is theirs.
 */
import type { AuthContext } from "./auth.ts";
import { serviceClient, type Db } from "./db.ts";
import { forbidden } from "./problem.ts";

/**
 * The caller's agent id, or 403. A traveler has none and does not belong on these routes.
 *
 * WHY THIS EXISTS RATHER THAN `requireRole(ctx, "agent")`, which would look equivalent:
 * `requireRole` only checks membership in a list. For `role = 'agent'` the platform_user
 * CHECK guarantees a non-null agent_id, so today the two are the same — but the CHECK's third
 * branch is a bare `(role = 'admin')`, so the moment anyone writes
 * `requireRole(ctx, "agent", "admin")` an admin with `agentId === null` walks through and the
 * null flows into a query as `undefined`. Returning the id, and refusing when there isn't
 * one, closes that by construction. Exactly the shape of `requireClientId`.
 */
export function requireAgentId(ctx: AuthContext): string {
  if (ctx.role !== "agent" || !ctx.agentId) {
    throw forbidden("This is the advisor's side of the platform.");
  }
  return ctx.agentId;
}

/**
 * The service-role client these routes run on.
 *
 * Named rather than calling `serviceClient()` inline, for the reason `tripDb()` gives: it is
 * the single place to look when asking "what privileges does this route actually run with".
 * And it is worth restating what the answer means — on the service role RLS checks nothing,
 * so every ownership test on this side is explicit, in SQL or in TypeScript, never inherited.
 */
export function agentDb(): Db {
  return serviceClient();
}
