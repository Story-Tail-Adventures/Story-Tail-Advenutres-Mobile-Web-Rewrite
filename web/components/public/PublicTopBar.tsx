import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { PUBLIC_NAV_LINKS } from "@/content/public/contact";
import { cn } from "@/lib/cn";
import { PublicAuthCluster } from "./PublicAuthCluster";
import { PublicNav } from "./PublicNav";

export type TopBarVariant = "solid" | "overlay";

/**
 * 96px public top bar (design: ScreenTopBar role="public"; mobile: MTopBar).
 *
 * `solid` — cream/navy bar, sticky at every width (About, results, gate, legal).
 * `overlay` — below `md` the bar floats transparent over the page's hero photo with white
 * text (landing, topic pages, explore, detail); from `md` it is the same solid sticky bar.
 *
 * The right cluster is a client island (PublicAuthCluster) rather than static markup,
 * because a signed-in visitor is perfectly entitled to be here — the proxy only bounces them
 * off `/` and the auth routes, not off /explore or the topic pages — and being asked to sign
 * in again reads as the site not knowing them. The signed-out pair is still what the
 * PRERENDERED html contains, which is what keeps every public page static and crawlable.
 */
export function PublicTopBar({ variant = "solid" }: { variant?: TopBarVariant }) {
  const overlay = variant === "overlay";
  return (
    <header
      className={cn(
        // The brand mark is the real lockup now: 201px wide at the 80px legibility floor,
        // against ~115px for the wordmark it replaced. That +86px does not fit alongside
        // five links AND two buttons at tablet — measured 823px of content in 753px at
        // 768px, with "Create account" clipped off the right edge. The links win the space
        // because they are the only surface for that IA; the buttons move to the drawer,
        // which already carries both as full-width controls, and return at `lg`.
        "pub-topbar z-40 flex items-center gap-2.5 px-3.5 md:max-web:px-4 web:gap-3.5 web:px-5",
        overlay ? "pub-topbar-overlay on-photo md:top-0" : "sticky top-0",
      )}
    >
      <Link href="/" aria-label="Story-Tail Adventures home" className="shrink-0">
        {overlay ? (
          <>
            <span className="md:hidden">
              <BrandMark size={80} tone="dark" alt="" />
            </span>
            <span className="hidden md:inline-flex">
              <BrandMark size={80} alt="" />
            </span>
          </>
        ) : (
          <BrandMark size={80} alt="" />
        )}
      </Link>

      <PublicNav links={PUBLIC_NAV_LINKS} overlay={overlay} />

      <PublicAuthCluster />
    </header>
  );
}
