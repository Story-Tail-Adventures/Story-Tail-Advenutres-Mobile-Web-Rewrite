import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { Trip } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/public/money";
import { DETAIL } from "./content";

interface PriceCardProps {
  trip: Trip;
  quoteHref: string;
  saveHref: string;
  /** Guest inquiry (mailto or the gate) — rendered as a plain <a>. */
  messageHref: string;
  className?: string;
}

/**
 * Price + CTAs card in the 2.0.5 aside (design C205). Full-width under the hero on tablet with
 * the two buttons side by side; a column in the right rail from 1024. Below `md` the page's
 * StickyCta carries the price instead, so callers hide this.
 */
export function PriceCard({ trip, quoteHref, saveHref, messageHref, className }: PriceCardProps) {
  return (
    <div className={cn("card p-4.5", className)}>
      <p className="t-label text-on-surface-variant">{DETAIL.price.startingAt}</p>
      <p className="t-display-s my-1 text-on-surface">
        {formatMoney(trip.from, { whole: true })}
        <span className="t-body text-on-surface-variant"> {DETAIL.price.perPerson}</span>
      </p>
      <p className="t-body-s text-on-surface-variant">{trip.priceNote}</p>

      <div className="mt-3.5 flex flex-col gap-2 md:flex-row lg:flex-col">
        <Link href={quoteHref} className="btn btn-filled w-full md:flex-1 lg:flex-none">
          {DETAIL.price.requestQuote}
        </Link>
        <Link href={saveHref} className="btn btn-tonal w-full md:flex-1 lg:flex-none">
          <Icon name="heart" size={14} />
          {DETAIL.price.favorite}
        </Link>
      </div>

      <p className="t-body-s mt-2.5 text-center text-on-surface-variant">{DETAIL.price.orNote}</p>
      <a href={messageHref} className="btn btn-text btn-sm mt-1 w-full">
        {DETAIL.price.messageGuest}
      </a>
    </div>
  );
}
