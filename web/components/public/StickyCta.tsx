import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Money } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/public/money";

interface CtaBase {
  label: string;
  icon?: IconName;
}

/**
 * Either navigates (`href` — a route, a `mailto:` or an external URL) or submits a form
 * elsewhere in the document by id (`submitFor`). 2.0.3 needs the second form: the artboard's
 * one Search control is the sticky bar, but the fields live in a card further up the page,
 * so the bar has to be the form's submit rather than a link that drops what was typed.
 *
 * `?: undefined` rather than `?: never` on the opposite member — that is what lets
 * `cta.submitFor !== undefined` narrow the union.
 */
type CtaLink =
  | (CtaBase & { href: string; submitFor?: undefined })
  | (CtaBase & { submitFor: string; href?: undefined });

interface StickyCtaProps {
  primary: CtaLink;
  secondary?: CtaLink;
  /** 2.0.5: "FROM $3,290 /pp" + heart + Request a quote. */
  price?: { from: Money; saveHref: string };
  /**
   * 2.0.5 only: the guest "message without an account" path §4.4 puts on the mobile
   * bottom bar. Rendered as a full-width second row, because four controls do not fit
   * one 360px row.
   */
  guest?: CtaLink;
}

/** next/link for same-origin paths; a plain anchor for mailto: and external hrefs. */
function CtaControl({
  cta,
  className,
  children,
}: {
  cta: CtaLink;
  className: string;
  children: React.ReactNode;
}) {
  if (cta.submitFor !== undefined) {
    return (
      <button type="submit" form={cta.submitFor} className={className}>
        {children}
      </button>
    );
  }
  if (cta.href.startsWith("/")) {
    return (
      <Link href={cta.href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={cta.href} className={className}>
      {children}
    </a>
  );
}

/**
 * Mobile-only bottom bar (design: MStickyCTA; Screen Inventory §4.3 Pattern H "sticky
 * bottom CTA"). Fixed to the viewport with safe-area padding; hidden from `md`.
 *
 * It deliberately renders NO spacer of its own. The bar is fixed, so the page must reserve
 * its height, but a spacer here would sit inside `<main>` — above PublicFooter — and leave
 * the footer under the bar. The reserve lives on `.pub-surface` in public.css instead, so
 * it lands after the footer.
 */
export function StickyCta({ primary, secondary, price, guest }: StickyCtaProps) {
  return (
    <div className={cn("sticky-cta", guest && "sticky-cta-tall")}>
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
          <CtaControl cta={primary} className="btn btn-filled min-h-11 flex-1">
            {primary.label}
          </CtaControl>
        </>
      ) : (
        <>
          {secondary && (
            <CtaControl cta={secondary} className="btn btn-text min-h-11 shrink-0">
              {secondary.label}
            </CtaControl>
          )}
          <CtaControl cta={primary} className="btn btn-filled min-h-11 flex-1">
            <Icon name={primary.icon ?? "message"} size={14} /> {primary.label}
          </CtaControl>
        </>
      )}

      {guest && (
        <CtaControl
          cta={guest}
          className="sticky-cta-row2 btn btn-text min-h-11 w-full"
        >
          <Icon name={guest.icon ?? "message"} size={14} /> {guest.label}
        </CtaControl>
      )}
    </div>
  );
}
