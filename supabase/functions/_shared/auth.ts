/**
 * Authentication and authorization for Edge Functions.
 */
import { userClient, serviceClient } from "./db.ts";
import { forbidden, unauthorized } from "./problem.ts";
import type { Database } from "./database.types.ts";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface AuthContext {
  /** auth.users.id, which IS public.account.id — see Data-Model §5.1.1. */
  accountId: string;
  platformUserId: string;
  role: UserRole;
  agentId: string | null;
  clientId: string | null;
  /** aal1 = password only. aal2 = a second factor was verified. */
  aal: "aal1" | "aal2";
  /** When the most recent factor was verified, from the JWT's amr claim. */
  lastAuthenticatedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}

interface AmrEntry {
  method: string;
  timestamp: number;
}

function decodeClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  try {
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

/**
 * Verify the caller and resolve them to a platform_user.
 *
 * The token is verified by `auth.getUser()`, which checks the signature against the
 * auth server. Never hand-roll that — the claim decoding below is only used to read
 * `aal` and `amr` AFTER the token has been verified, because those are not returned by
 * getUser().
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token.");
  }
  const jwt = authorization.slice("Bearer ".length);

  const { data, error } = await userClient(req).auth.getUser(jwt);
  if (error || !data.user) throw unauthorized("Invalid or expired token.");

  // account.id === auth.users.id, so this is a single hop rather than two.
  // serviceClient: platform_user's self-read policy would work here, but this lookup
  // runs before we know the caller's role, and an agent resolving their own row must
  // not depend on a client-shaped policy.
  const { data: pu, error: puError } = await serviceClient()
    .from("platform_user")
    .select("id, role, agent_id, client_id")
    .eq("account_id", data.user.id)
    .maybeSingle();

  if (puError) throw unauthorized("Could not resolve the caller.");
  if (!pu) throw forbidden("This account has no platform user.");

  const claims = decodeClaims(jwt);
  const amr = Array.isArray(claims.amr) ? (claims.amr as AmrEntry[]) : [];
  const mostRecent = amr.reduce<number | null>(
    (acc, e) => (typeof e?.timestamp === "number" && (acc === null || e.timestamp > acc) ? e.timestamp : acc),
    null,
  );

  return {
    accountId: data.user.id,
    platformUserId: pu.id,
    role: pu.role,
    agentId: pu.agent_id,
    clientId: pu.client_id,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    lastAuthenticatedAt: mostRecent ? new Date(mostRecent * 1000) : null,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  };
}

export function requireRole(ctx: AuthContext, ...roles: UserRole[]): void {
  if (!roles.includes(ctx.role)) {
    throw forbidden(`Requires role: ${roles.join(" or ")}.`);
  }
}

/**
 * Require a SECOND FACTOR VERIFIED RECENTLY — not merely enrolled.
 *
 * This distinction is the whole point. "Has MFA enrolled" is a property of the account
 * and is true forever once set up; "was challenged in the last 15 minutes" is what
 * actually protects a PAN reveal (Screen Inventory 3.6.4) from a stolen session. Checking
 * the former and calling it step-up is the difference between passing and failing
 * `audit-pci`.
 *
 * Synchronous: everything it needs is already in the verified JWT that `requireUser`
 * decoded, so there is no round trip to make.
 */
export function requireRecentMfa(ctx: AuthContext, maxAgeSeconds = 900): void {
  if (ctx.aal !== "aal2") {
    throw forbidden("This action requires multi-factor authentication.");
  }
  if (!ctx.lastAuthenticatedAt) {
    throw forbidden("Could not determine when MFA was last verified.");
  }
  const ageSeconds = (Date.now() - ctx.lastAuthenticatedAt.getTime()) / 1000;
  if (ageSeconds > maxAgeSeconds) {
    throw forbidden(
      `MFA was verified ${Math.round(ageSeconds)}s ago; this action requires it within ${maxAgeSeconds}s.`,
    );
  }
}
