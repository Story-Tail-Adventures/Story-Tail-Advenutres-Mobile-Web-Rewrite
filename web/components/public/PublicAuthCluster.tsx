"use client";

import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import NextLink from "next/link";

import { Avatar } from "@/components/public/Avatar";
import { UP_WEB } from "@/lib/mui/sx";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

/** The legacy .btn-sm box on MUI's small button; the sides open up a notch at `web`. */
const SIGN_IN = { minHeight: 32, px: 1.5, [UP_WEB]: { px: 2 } } as const;
const CREATE_ACCOUNT = { minHeight: 32, px: 1.75, [UP_WEB]: { px: 2 } } as const;

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
 * `.pub-auth-out` / `.pub-auth-in` carry NO display of their own here — not in sx either.
 * Their layout lives in public.css next to the gate, in the same cascade layer, which is
 * what lets the gate's `display: none` win.
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

  // No `ml: auto`. PublicNav's spacer opens the right-hand group now, so this just follows
  // the theme toggle in document order.
  return (
    <Box data-auth={status} sx={{ display: { xs: "none", lg: "flex" } }}>
      {status !== "in" && (
        <div className="pub-auth-out">
          <MuiButton component={NextLink} href="/login" variant="text" size="small" sx={SIGN_IN}>
            Sign in
          </MuiButton>
          <MuiButton
            component={NextLink}
            href="/join"
            variant="contained"
            size="small"
            sx={CREATE_ACCOUNT}
          >
            Create account
          </MuiButton>
        </div>
      )}

      {status !== "out" && (
        <NextLink href="/dashboard" className="pub-auth-in" aria-label="Your account">
          {/* Decorative: the accessible name is the link's, exactly as BrandMark is `alt=""`
              inside its own labelled link. Empty initials mean the letters are still in
              flight, so this is a plain circle for a moment rather than a monogram that
              changes under the reader. */}
          <Avatar initials={initials} />
        </NextLink>
      )}
    </Box>
  );
}
