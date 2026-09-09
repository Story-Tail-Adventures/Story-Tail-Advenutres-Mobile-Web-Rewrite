import Link from "next/link";

import type { IconName } from "@/components/ui/Icon";

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
export type CtaLink =
  | (CtaBase & { href: string; submitFor?: undefined })
  | (CtaBase & { submitFor: string; href?: undefined });

/**
 * next/link for same-origin paths; a plain anchor for mailto: and external hrefs.
 *
 * Lives in its own module rather than inside StickyCta so the client island that swaps the
 * sticky bar's secondary control (StickyCtaSecondary) can render through the same thing,
 * without the two files importing each other.
 */
export function CtaControl({
  cta,
  className,
  children,
  dataAuth,
}: {
  cta: CtaLink;
  className: string;
  children: React.ReactNode;
  /**
   * Renders as `data-auth`, which is how the pre-paint gate in styles/public.css scopes
   * itself to the unresolved state. Only StickyCtaSecondary passes it.
   */
  dataAuth?: string;
}) {
  if (cta.submitFor !== undefined) {
    return (
      <button type="submit" form={cta.submitFor} className={className} data-auth={dataAuth}>
        {children}
      </button>
    );
  }
  if (cta.href.startsWith("/")) {
    return (
      <Link href={cta.href} className={className} data-auth={dataAuth}>
        {children}
      </Link>
    );
  }
  return (
    <a href={cta.href} className={className} data-auth={dataAuth}>
      {children}
    </a>
  );
}
