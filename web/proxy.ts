import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refreshes the Supabase session and gates the protected route groups. See
 * web/lib/supabase/middleware.ts for the logic.
 *
 * This is the `proxy` file convention, not `middleware` — Next.js 16 deprecated and renamed
 * `middleware.ts` to `proxy.ts`, and the exported function with it. (The helper module keeps
 * the name `middleware.ts` because that is what @supabase/ssr's own docs call it.)
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * ── THE MATCHER IS AN ALLOWLIST, AND IT IS A COST CONTROL ────────────────────────
 *
 * It used to be an exclusion: everything except `_next` and static file extensions. That is
 * the shape Next's docs suggest, and on this app it was expensive twice over.
 *
 *   1. Vercel bills a proxy run as its own function invocation, on top of the page's. So
 *      every request cost two. The 2026-10-26 usage pause shows it exactly: 698K CDN
 *      requests against 1.4M function invocations.
 *   2. A path the proxy matches cannot be served straight off the CDN — the request has to
 *      reach a function first. The public marketing pages are deliberately prerendered as
 *      static HTML (app/(public)/layout.tsx goes out of its way to read no request-time
 *      APIs), and the proxy sitting in front of them turned every one of those cheap CDN
 *      hits into 43KB of Fast Origin Transfer. That is the limit that paused the account.
 *
 * Both of those were being paid almost entirely for crawlers, scanners and bots: about 700K
 * requests in 30 days against roughly 15 real human views a month (app/seo.ts). An allowlist
 * also covers the probes an exclusion list never thinks of — `/wp-login.php`, `/.env` and
 * the rest of the background noise a bare *.vercel.app hostname attracts — which now get a
 * static 404 from the edge instead of a function and a Supabase round trip.
 *
 * ── WHAT HAS TO BE IN IT ─────────────────────────────────────────────────────────
 *
 * Every PROTECTED_PREFIXES and AUTH_ONLY_PREFIXES entry from lib/supabase/middleware.ts,
 * plus "/" for the signed-in bounce to /dashboard. proxy.test.ts asserts that set matches
 * this list exactly, because the failure mode of getting it wrong is silent: a protected
 * prefix missing from here keeps rendering, just with no gate in front of it.
 *
 * Each prefix is listed TWICE, bare and with `/:path*`. `/dashboard/:path*` alone does match
 * `/dashboard` under the path-to-regexp Next uses today, but that is a library detail to be
 * betting an auth gate on, and it has changed before. Being explicit costs a line.
 *
 * ── WHAT IS NO LONGER IN IT ──────────────────────────────────────────────────────
 *
 * The public pages. A signed-in visitor browsing them no longer has their session refreshed
 * or their chrome flag rewritten on each one, and that is fine: the flag is written at sign
 * in and cleared at sign out (both under /login), it outlives its token by design, and
 * /api/account/chrome is the authority that corrects a stale one after paint
 * (lib/auth/use-auth-chrome.ts). An access token that expires while someone reads about
 * Aruba is refreshed by the next request that needs it.
 */
export const config = {
  matcher: [
    // The front door — a signed-in visitor is bounced to /dashboard from here.
    "/",

    // PROTECTED_PREFIXES
    "/dashboard",
    "/dashboard/:path*",
    "/trips",
    "/trips/:path*",
    "/account",
    "/account/:path*",
    "/documents",
    "/documents/:path*",
    "/messages",
    "/messages/:path*",
    "/agent",
    "/agent/:path*",
    "/mfa",
    "/mfa/:path*",
    "/welcome",
    "/welcome/:path*",
    "/onboarding",
    "/onboarding/:path*",

    // AUTH_ONLY_PREFIXES (/login/:path* also covers the 2.1.7 MFA challenge)
    "/login",
    "/login/:path*",
    "/register",
    "/register/:path*",
    "/join",
    "/join/:path*",
    "/forgot-password",
    "/forgot-password/:path*",
  ],
};
