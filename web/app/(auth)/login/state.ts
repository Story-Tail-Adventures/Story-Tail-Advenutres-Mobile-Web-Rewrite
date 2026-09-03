import type { MappedAuthError } from "@/lib/auth-errors";

/**
 * Login form state.
 *
 * Lives here rather than in actions.ts because a `"use server"` module may only export
 * async functions — every other export is treated as a Server Action and Next.js rejects
 * it at runtime (not at typecheck, which is why it is worth keeping separate).
 */
export interface LoginState {
  fieldErrors?: { email?: string[]; password?: string[] };
  formError?: MappedAuthError;
  /** Echoed back so a failed submit does not clear what they typed. */
  email?: string;
}

export const initialLoginState: LoginState = {};

/**
 * `safeNext` moved to web/lib/safe-next.ts so the public sign-up gate and the auth
 * callback route can share it. Re-exported here so existing imports keep working.
 */
export { safeNext } from "@/lib/safe-next";
