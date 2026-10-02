"use client";

import Box from "@mui/material/Box";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

/**
 * Hides its children from anybody already signed in.
 *
 * For prompts whose whole purpose is to get somebody an account — the /explore sign-in
 * banner — where the signed-in answer is "nothing", not "something else". (Where there IS
 * something else to show, branch on `useAuthChrome` directly, as PublicAuthCluster does.)
 *
 * Like the top bar, this ships in the prerendered HTML and is removed before first paint by
 * the gate in styles/public.css keyed off `data-auth="unknown"`. A hydration-time removal
 * would drop a full-width band out of the page after it had been painted, reflowing
 * everything below it.
 *
 * ── IT TAKES NO className AND NO sx, ON PURPOSE ─────────────────────────────────
 *
 * A display rule landing on this wrapper — a Tailwind `hidden` / `md:block` (utilities
 * layer, above public.css) or a `display` in sx that something later outranks — would beat
 * the gate's `display: none` and the band would never hide, silently, and only for
 * signed-in visitors. Breakpoint rules belong on the child (SigninBanner passes them to
 * DismissibleBanner). The Box here carries nothing but the gate's class and attribute.
 *
 * Separate from DismissibleBanner on purpose: that one is about a choice the visitor made,
 * this one is about who they are.
 */
export function SignedOutOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuthChrome();

  if (status === "in") return null;

  return (
    <Box className="pub-signedout-only" data-auth={status}>
      {children}
    </Box>
  );
}
