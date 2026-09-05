/**
 * The OAuth providers the app offers, in a module with no `"use server"` directive so that
 * server actions, route handlers and pages can all import them. (A `"use server"` module
 * may only export async functions, which is why the allowlist cannot live in ./actions.ts.)
 */

export type OAuthProvider = "google" | "apple";

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "apple"];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  // Widened because `includes` on a literal-union tuple refuses an arbitrary string —
  // which is exactly the thing being tested here.
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: "Google",
  apple: "Apple",
};

/**
 * GoTrue error codes that mean "this social identity belongs to an address that already
 * has an account, and I will not link them for you" — the entry condition for Screen
 * 2.1.8.
 *
 * Supabase links identities automatically when the existing address is already confirmed,
 * so reaching this at all means the match proved nothing on its own. That is exactly the
 * case where a password has to be typed before the two accounts are joined.
 */
const COLLISION_CODES = new Set([
  "identity_already_exists",
  "email_exists",
  "user_already_exists",
]);

export function isIdentityCollision(code: string | null | undefined): boolean {
  return typeof code === "string" && COLLISION_CODES.has(code);
}
