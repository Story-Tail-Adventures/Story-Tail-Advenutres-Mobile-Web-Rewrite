/**
 * The OAuth providers the app offers, in a module with no `"use server"` directive so that
 * server actions, route handlers and pages can all import them. (A `"use server"` module
 * may only export async functions, which is why the allowlist cannot live in ./actions.ts.)
 */
export type OAuthProvider = "google" | "apple";
export declare const OAUTH_PROVIDERS: readonly OAuthProvider[];
export declare function isOAuthProvider(value: unknown): value is OAuthProvider;
export declare const PROVIDER_LABEL: Record<OAuthProvider, string>;
export declare function isIdentityCollision(code: string | null | undefined): boolean;
