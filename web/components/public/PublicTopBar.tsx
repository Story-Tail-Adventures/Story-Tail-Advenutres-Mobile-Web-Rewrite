import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { PUBLIC_NAV_LINKS } from "@/content/public/contact";
import { cn } from "@/lib/cn";
import { PublicNav } from "./PublicNav";

export type TopBarVariant = "solid" | "overlay";

/**
 * 56px public top bar (design: ScreenTopBar role="public"; mobile: MTopBar).
 *
 * `solid` — cream/navy bar, sticky at every width (About, results, gate, legal).
 * `overlay` — below `md` the bar floats transparent over the page's hero photo with white
 * text (landing, topic pages, explore, detail); from `md` it is the same solid sticky bar.
 *
 * The right cluster is static ("Sign in" / "Create account") because the public layout
 * never reads cookies — that is what keeps every public page prerenderable. Signed-in
 * visitors who click through are bounced by the proxy.
 */
export function PublicTopBar({ variant = "solid" }: { variant?: TopBarVariant }) {
  const overlay = variant === "overlay";
  return (
    <header
      className={cn(
        // Tablet (768–1199) is ~20px tighter than the 1440 artboard so brand + five links +
        // two buttons fit without horizontal overflow; web restores the prototype spacing.
        "pub-topbar z-40 flex items-center gap-2.5 px-3.5 md:px-4 web:gap-3.5 web:px-5",
        overlay ? "pub-topbar-overlay on-photo md:top-0" : "sticky top-0",
      )}
    >
      <Link href="/" aria-label="Story-Tail Adventures home" className="shrink-0">
        {overlay ? (
          <>
            <span className="md:hidden">
              <BrandWordmark size={24} onDark />
            </span>
            <span className="hidden md:inline-flex">
              <BrandWordmark size={26} />
            </span>
          </>
        ) : (
          <BrandWordmark size={26} />
        )}
      </Link>

      <PublicNav links={PUBLIC_NAV_LINKS} overlay={overlay} />

      <div className="ml-auto hidden items-center gap-1 md:flex web:gap-1.5">
        <Link href="/login" className="btn btn-text btn-sm px-3 web:px-4">
          Sign in
        </Link>
        <Link href="/join" className="btn btn-filled btn-sm px-3.5 web:px-4">
          Create account
        </Link>
      </div>
    </header>
  );
}
