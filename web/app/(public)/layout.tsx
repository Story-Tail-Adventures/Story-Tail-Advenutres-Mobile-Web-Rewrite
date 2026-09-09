import { PlaceholderBanner } from "@/components/public/PlaceholderBanner";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SkipLink } from "@/components/public/SkipLink";

/**
 * Public (pre-auth) shell — Screen Inventory §2.0, Pattern H.
 *
 * Deliberately free of request-time APIs (no cookies(), headers() or auth lookups): that is
 * what lets every public page prerender as static HTML. The top bar lives in the nested
 * (hero) / (plain) layouts because they differ only in how it sits on the hero photo.
 *
 * ── "PRE-AUTH" IS ABOUT THE RENDER, NOT THE VISITOR ─────────────────────────────
 *
 * web/proxy.ts bounces a signed-in visitor off `/` and the auth routes, and nothing else —
 * so /explore, the topic pages, /how-it-works, the results page and /legal are all reachable
 * while signed in, and they used to greet those visitors with "Sign in / Create account".
 *
 * The fix keeps this layout exactly as dumb as it is. The proxy publishes one flag cookie
 * (lib/auth/chrome-flag.ts), a pre-paint inline script turns it into an attribute on <html>
 * (components/AuthChromeScript.tsx), and the affected chrome ships BOTH states so CSS can
 * pick one before the first frame (styles/public.css). Nothing on this path reads a request,
 * a cookie or an env var at render time, so the pages stay static — check the route table in
 * `next build` output if you change anything here.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="pub-surface flex min-h-dvh flex-1 flex-col bg-bg text-on-bg">
      <SkipLink />
      <PlaceholderBanner />
      {children}
      <PublicFooter />
    </div>
  );
}
