"use client";

import { CtaControl, type CtaLink } from "./CtaControl";
import { cn } from "@/lib/cn";
import { useAuthChrome } from "@/lib/auth/use-auth-chrome";

/**
 * The sticky bar's secondary control, swapped for somebody already signed in.
 *
 * §4.4 makes this bar the MOBILE equivalent of the /explore sign-in banner, so leaving a
 * "Sign in" button here while the banner and the top bar both know better would fix the
 * fault only above `md` — and the bar is mobile-only, so that is the half a phone sees.
 *
 * It carries the same pre-paint gate as the top bar, for the same reason: picking on the
 * store's status alone would render "Sign in" for one frame before resolving to "Your trips",
 * which is exactly the flash AuthChromeScript exists to prevent. The controls are the same
 * size, so nothing reflows either way — but a signed-in visitor should not watch the bar
 * change its mind.
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

  return (
    <>
      {status !== "in" && (
        <CtaControl cta={signedOut} className={cn(className, "pub-cta-out")} dataAuth={status}>
          {signedOut.label}
        </CtaControl>
      )}
      {status !== "out" && (
        <CtaControl cta={signedIn} className={cn(className, "pub-cta-in")} dataAuth={status}>
          {signedIn.label}
        </CtaControl>
      )}
    </>
  );
}
