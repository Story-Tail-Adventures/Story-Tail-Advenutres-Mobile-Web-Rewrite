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
