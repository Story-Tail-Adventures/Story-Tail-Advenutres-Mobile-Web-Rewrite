"use client";

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
 * ── IT TAKES NO className, ON PURPOSE ────────────────────────────────────────────
 *
 * Tailwind's utilities sit in a later cascade layer than styles/public.css, so a `hidden` or
 * `md:block` landing on this wrapper would beat the gate's `display: none` and the band would
 * never hide — silently, and only for signed-in visitors. Breakpoint utilities belong on the
 * child (SigninBanner passes them to DismissibleBanner).
 *
 * Separate from DismissibleBanner on purpose: that one is about a choice the visitor made,
 * this one is about who they are.
 */
export function SignedOutOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuthChrome();

  if (status === "in") return null;

  return (
    <div className="pub-signedout-only" data-auth={status}>
      {children}
    </div>
  );
}
