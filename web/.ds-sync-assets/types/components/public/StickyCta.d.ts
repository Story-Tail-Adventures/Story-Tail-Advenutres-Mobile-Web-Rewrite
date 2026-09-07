import { type IconName } from "../ui/Icon";
import type { Money } from "../../content/public/types";
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
type CtaLink = (CtaBase & {
    href: string;
    submitFor?: undefined;
}) | (CtaBase & {
    submitFor: string;
    href?: undefined;
});
interface StickyCtaProps {
    primary: CtaLink;
    secondary?: CtaLink;
    /** 2.0.5: "FROM $3,290 /pp" + heart + Request a quote. */
    price?: {
        from: Money;
        saveHref: string;
    };
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
export declare function StickyCta({ primary, secondary, price, guest }: StickyCtaProps): import("react").JSX.Element;
export {};
