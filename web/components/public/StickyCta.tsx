import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Money } from "@/content/public/types";
import { formatMoney } from "@/lib/public/money";

interface CtaLink {
  label: string;
  href: string;
  icon?: IconName;
}

interface StickyCtaProps {
  primary: CtaLink;
  secondary?: CtaLink;
  /** 2.0.5: "FROM $3,290 /pp" + heart + Request a quote. */
  price?: { from: Money; saveHref: string };
}

/** next/link for same-origin paths; a plain anchor for mailto: and external hrefs. */
function CtaAnchor({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/**
 * Mobile-only bottom bar (design: MStickyCTA; Screen Inventory §4.3 Pattern H "sticky
 * bottom CTA"). Fixed to the viewport with safe-area padding; renders a spacer so the
 * page's last section and the footer are never hidden behind it. Hidden from `md`.
 */
export function StickyCta({ primary, secondary, price }: StickyCtaProps) {
  return (
    <>
      <div className="sticky-cta-spacer" aria-hidden="true" />
      <div className="sticky-cta">
        {price ? (
          <>
            <div className="flex-1">
              <div className="t-label text-on-surface-variant">FROM</div>
              <div className="t-price-lg text-on-surface">
                {formatMoney(price.from, { whole: true })}
                <span className="t-fine text-on-surface-variant"> /pp</span>
              </div>
            </div>
            <Link
              href={price.saveHref}
              className="btn btn-tonal size-11 rounded-full p-0"
              aria-label="Save this trip"
            >
              <Icon name="heart" size={16} />
            </Link>
            <Link href={primary.href} className="btn btn-filled min-h-11 flex-1">
              {primary.label}
            </Link>
          </>
        ) : (
          <>
            {secondary && (
              <CtaAnchor href={secondary.href} className="btn btn-text min-h-11 shrink-0">
                {secondary.label}
              </CtaAnchor>
            )}
            <CtaAnchor href={primary.href} className="btn btn-filled min-h-11 flex-1">
              <Icon name={primary.icon ?? "message"} size={14} /> {primary.label}
            </CtaAnchor>
          </>
        )}
      </div>
    </>
  );
}
