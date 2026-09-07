import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FOOTER_LEGAL_LINKS, MARKETING_SITE_URL } from "@/content/public/contact";
import { cn } from "@/lib/cn";
import { Container } from "./Container";

/**
 * Footer links are the only route to the 2.0.7 legal pages on a phone, so they carry a
 * real 44px touch row below `md` (they measured 16px tall, well under the tap floor the
 * rest of the public surface holds to). From `md` they go back to inline density.
 */
const FOOTER_LINK =
  "inline-flex min-h-11 items-center hover:text-on-surface md:min-h-0";

/**
 * Global public footer (design: C201 footer; Screen Inventory 2.0.7 "footer of every
 * screen"). The marketing site stays a separate property (BRD §4.2); we only link to it.
 */
export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="pub-footer border-t border-outline-variant bg-surface-1">
      <Container
        size="wide"
        className="t-fine flex flex-col gap-2.5 py-3.5 text-on-surface-variant md:flex-row md:items-center md:justify-between md:py-3"
      >
        <span>© {year} Story-Tail Adventures · Hosted by Inteletravel</span>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={FOOTER_LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/how-it-works" className={FOOTER_LINK}>
                How it works
              </Link>
            </li>
            <li>
              <a
                href={MARKETING_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(FOOTER_LINK, "gap-1")}
              >
                Marketing site <Icon name="external" size={11} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
