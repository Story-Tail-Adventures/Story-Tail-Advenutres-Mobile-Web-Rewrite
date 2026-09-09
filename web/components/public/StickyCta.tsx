import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { Money } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/public/money";
import { CtaControl, type CtaLink } from "./CtaControl";
import { StickyCtaSecondary } from "./StickyCtaSecondary";

interface StickyCtaProps {
  primary: CtaLink;
  secondary?: CtaLink;
  /**
   * What `secondary` becomes for somebody already signed in. §4.4 makes this bar the mobile
   * equivalent of the /explore sign-in banner, so a page whose secondary is "Sign in" has to
   * say what replaces it — otherwise the fault this fixes survives on phones.
   */
  secondarySignedIn?: CtaLink;
  /** 2.0.5: "FROM $3,290 /pp" + heart + Request a quote. */
  price?: { from: Money; saveHref: string };
  /**
   * 2.0.5 only: the guest "message without an account" path §4.4 puts on the mobile
   * bottom bar. Rendered as a full-width second row, because four controls do not fit
   * one 360px row.
   */
  guest?: CtaLink;
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
export function StickyCta({ primary, secondary, secondarySignedIn, price, guest }: StickyCtaProps) {
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
          {secondary &&
            (secondarySignedIn ? (
              <StickyCtaSecondary
                signedOut={secondary}
                signedIn={secondarySignedIn}
                className="btn btn-text min-h-11 shrink-0"
              />
            ) : (
              <CtaControl cta={secondary} className="btn btn-text min-h-11 shrink-0">
                {secondary.label}
              </CtaControl>
            ))}
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
