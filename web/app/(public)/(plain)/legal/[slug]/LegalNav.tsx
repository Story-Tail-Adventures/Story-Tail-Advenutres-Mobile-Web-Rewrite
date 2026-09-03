import Link from "next/link";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import type { LegalSlug } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { LEGAL_PAGE, legalHref } from "./content";

interface LegalNavProps {
  active: LegalSlug;
}

/**
 * Section nav for the legal pages (design: C207 aside / M207 chip strip).
 *
 * From `md` it is the 260px first track of `.legal-layout`: a surface-1 column with the
 * "LEGAL & COMPLIANCE" label, one link per document (full titles, as on the desktop artboard)
 * and the print tip. Below `md` the same documents render as a snap chip strip using each
 * document's short `navLabel`. `aria-current` marks the open document in both. `.legal-nav`
 * hides the whole thing in print (public.css).
 */
export function LegalNav({ active }: LegalNavProps) {
  return (
    <nav
      aria-label={LEGAL_PAGE.navLabel}
      className="legal-nav md:border-r md:border-outline-variant md:bg-surface-1"
    >
      {/* md and up: aside column */}
      <div className="hidden p-5.5 md:block">
        <p className="t-label mb-2.5 text-on-surface-variant">{LEGAL_PAGE.navHeading}</p>
        <ul className="flex flex-col gap-0.5">
          {LEGAL_SLUGS.map((slug) => {
            const isActive = slug === active;
            return (
              <li key={slug}>
                <Link
                  href={legalHref(slug)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "t-label-l block rounded-sm px-3 py-2",
                    isActive
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-surface-2",
                  )}
                >
                  {LEGAL_DOCS[slug].title}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="t-fine mt-5 rounded-md bg-surface-2 p-3 leading-normal text-on-surface-variant">
          {LEGAL_PAGE.tip}
        </p>
      </div>

      {/* Below md: chip strip (M207). `.h-scroll` bleeds into the 18px gutter the wrapper sets. */}
      <div className="px-4.5 pt-3.5 md:hidden">
        <ul className="h-scroll">
          {LEGAL_SLUGS.map((slug) => {
            const isActive = slug === active;
            return (
              <li key={slug}>
                <Link
                  href={legalHref(slug)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "chip tap-44",
                    isActive
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-surface-2 text-on-surface-variant",
                  )}
                >
                  {LEGAL_DOCS[slug].navLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
