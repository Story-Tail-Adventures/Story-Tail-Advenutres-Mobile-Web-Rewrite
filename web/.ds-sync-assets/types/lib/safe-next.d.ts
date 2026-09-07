/**
 * Only allow same-origin relative paths, so a `?next=` parameter cannot be an open
 * redirect. Shared by the login action (web/app/(auth)/login), the public sign-up gate
 * (web/app/(public)/(plain)/join) and the auth callback route (web/app/auth/callback).
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
export declare function safeNext(raw: FormDataEntryValue | string | null | undefined, fallback?: string): string;
