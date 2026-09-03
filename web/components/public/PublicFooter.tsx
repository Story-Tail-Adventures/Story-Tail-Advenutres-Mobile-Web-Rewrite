import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FOOTER_LEGAL_LINKS, MARKETING_SITE_URL } from "@/content/public/contact";
import { Container } from "./Container";

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
                <Link href={link.href} className="hover:text-on-surface">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/how-it-works" className="hover:text-on-surface">
                How it works
              </Link>
            </li>
            <li>
              <a
                href={MARKETING_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-on-surface"
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
