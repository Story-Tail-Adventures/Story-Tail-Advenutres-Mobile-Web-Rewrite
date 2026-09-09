import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatDayLong } from "@/lib/public/dates";
import type { PublicSailing } from "@/lib/public/cruises";
import { requestQuoteHref } from "@/lib/public/links";
import { RESULTS } from "./content";

/**
 * One synced sailing (design: the C204 row, and the 2.3.4 cruise card it is closest to).
 *
 * NO FARE ANYWHERE ON THIS CARD, by construction rather than by omission: `PublicSailing`
 * has no price field, because the Edge Function does not select one. Free-Travel-APIs §4.7 —
 * "launch without it" — is the rule, and §1.3.4/§9.2 are why. The price column that would
 * otherwise sit on the right of a C204 row carries the itinerary instead, which is what
 * someone choosing a cruise is actually reading for.
 *
 * The whole card is the link, same as a hotel: a sailing has no detail page either, so
 * there is exactly one thing to do with it.
 */
export function CruiseCard({ sailing }: { sailing: PublicSailing }) {
  const quote = requestQuoteHref({
    kind: "cruise",
    tripType: "cruise",
    source: "track_cruises",
    name: sailing.title,
    place: sailing.destinations[0],
    checkIn: sailing.departureDate,
    // The sailing's own length is the stay — a cruise quote has no separate check-out to ask
    // for, which is why the search bar's dates do not reach this card.
    checkOut: sailing.nights ? addNights(sailing.departureDate, sailing.nights) : undefined,
    ref: sailing.id,
  });

  const overline = [sailing.line, sailing.nights ? RESULTS.cruises.nights(sailing.nights) : null]
    .filter(Boolean)
    .join(" · ");

  const shown = sailing.ports.slice(0, 4);
  const rest = sailing.ports.length - shown.length;

  return (
    <article className="card group relative p-0">
      <div className="px-4 py-3.5 web:px-4.5">
        {overline && <span className="t-tag-navy">{overline}</span>}
        <h2 className="t-title-l mt-1.5 mb-0.5 text-on-surface">
          <Link href={quote} className="link-stretch rounded-sm group-hover:underline">
            {sailing.title}
          </Link>
        </h2>

        <p className="t-body-s flex flex-wrap items-center gap-x-1.5 text-on-surface-variant">
          <Icon name="ship" size={12} className="shrink-0 text-brand-orange" />
          {sailing.ship}
          <span aria-hidden="true">·</span>
          {RESULTS.cruises.sailsOn} {formatDayLong(sailing.departureDate)}
        </p>

        {shown.length > 0 && (
          <div className="mt-2.5">
            <p className="t-label text-on-surface-variant">{RESULTS.cruises.itinerary}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {shown.map((port) => (
                <li key={port} className="chip h-6 px-2 text-on-surface-variant">
                  {port}
                </li>
              ))}
              {rest > 0 && (
                <li className="chip h-6 px-2 text-on-surface-variant">
                  {RESULTS.cruises.morePorts(rest)}
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end">
          {/* A span, not a link: the card already is one. */}
          <span aria-hidden="true" className="btn btn-filled btn-sm">
            {RESULTS.cruises.quote}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Departure + nights, as a civil date. Kept off `Date` arithmetic for the usual reason. */
function addNights(iso: string, nights: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + nights);
  return date.toISOString().slice(0, 10);
}
