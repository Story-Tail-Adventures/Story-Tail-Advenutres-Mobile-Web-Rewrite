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

const DEFAULT_NEXT = "/dashboard";

/**
 * Only allow same-origin relative paths, so `?next=` cannot be an open redirect.
 *
 * A startsWith("/") && !startsWith("//") check is NOT enough. The WHATWG URL parser
 * treats a backslash as a path separator for special schemes, so "/\evil.com" resolves
 * to http://evil.com/ — and Next's server-action reducer compares origins and then does
 * a full hard navigation for anything off-origin, so the user lands on the attacker's
 * site immediately after a successful sign-in.
 *
 * Resolving against a fixed base and comparing origins is what actually settles it:
 * whatever parsing quirk the input relies on, it has to survive the same parser we then
 * check.
 */
export function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/")) return DEFAULT_NEXT;

  const base = "http://localhost";
  try {
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return DEFAULT_NEXT;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}
