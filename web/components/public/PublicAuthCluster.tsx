"use client";

import Link from "next/link";

import { Avatar } from "@/components/public/Avatar";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

/**
 * The public top bar's right cluster: "Sign in" / "Create account" for a visitor, their
 * initials for somebody already signed in.
 *
 * ── WHY BOTH STATES ARE IN THE MARKUP ────────────────────────────────────────────
 *
 * The public pages are prerendered, so the server has no idea who is asking (see
 * app/(public)/layout.tsx). While `status` is "unknown" this renders BOTH clusters and the
 * gate in styles/public.css shows one, keyed off the attribute the pre-paint script set.
 * That is the same trick BrandMark uses for the theme-swapped lockup, and for the same
 * reason: the right answer is not knowable at prerender time, but it IS knowable before
 * first paint.
 *
 * The signed-out pair therefore stays in the static HTML unconditionally, which is what
 * keeps it in the crawlable page and working with JavaScript off.
 *
 * ── WHY THE AVATAR IS A LINK ─────────────────────────────────────────────────────
 *
 * The dashboard's own avatar is an inert span (components/client/ClientTopBar.tsx) because
 * the nav rail is right there. Here it is the only way back: today a signed-in visitor
 * clicking "Sign in" gets bounced to /dashboard by the proxy, so replacing that with a dead
 * circle would strand them. It goes to /dashboard until §2.5.1 Account exists.
 */
export function PublicAuthCluster() {
  const { status, initials } = useAuthChrome();

  return (
    <div className="ml-auto hidden lg:flex" data-auth={status}>
      {status !== "in" && (
        <div className="pub-auth-out">
          <Link href="/login" className="btn btn-text btn-sm px-3 web:px-4">
            Sign in
          </Link>
          <Link href="/join" className="btn btn-filled btn-sm px-3.5 web:px-4">
            Create account
          </Link>
        </div>
      )}

      {status !== "out" && (
        <Link href="/dashboard" className="pub-auth-in" aria-label="Your account">
          {/* Decorative: the accessible name is the link's, exactly as BrandMark is `alt=""`
              inside its own labelled link. Empty initials mean the letters are still in
              flight, so this is a plain circle for a moment rather than a monogram that
              changes under the reader. */}
          <Avatar initials={initials} />
        </Link>
      )}
    </div>
  );
}
