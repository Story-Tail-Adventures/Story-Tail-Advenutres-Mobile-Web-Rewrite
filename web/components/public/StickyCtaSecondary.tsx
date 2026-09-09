"use client";

import { CtaControl, type CtaLink } from "./CtaControl";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

/**
 * The sticky bar's secondary control, swapped for somebody already signed in.
 *
 * §4.4 makes this bar the MOBILE equivalent of the /explore sign-in banner, so leaving a
 * "Sign in" button here while the banner and the top bar both know better would fix the
 * fault only above `md` — and the bar is mobile-only, so that is the half that shows on a
 * phone.
 *
 * Unlike the top bar this needs no pre-paint CSS gate: both controls are the same size and
 * sit in the same slot, so the swap costs no reflow, and `.sticky-cta` is a fixed bar whose
 * height the page reserves either way.
 */
export function StickyCtaSecondary({
  signedOut,
  signedIn,
  className,
}: {
  signedOut: CtaLink;
  signedIn: CtaLink;
  className: string;
}) {
  const { status } = useAuthChrome();
  const cta = status === "in" ? signedIn : signedOut;

  return (
    <CtaControl cta={cta} className={className}>
      {cta.label}
    </CtaControl>
  );
}
