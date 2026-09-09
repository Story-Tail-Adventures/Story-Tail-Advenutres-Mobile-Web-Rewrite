import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { PublicHotel } from "@/lib/public/hotels";
import { cn } from "@/lib/cn";
import { joinHref } from "@/lib/public/links";
import { formatMoney } from "@/lib/public/money";
import { RESULTS } from "./content";

/**
 * One live hotel (design: the C233 row — 180px photo | body | rate column — which is the
 * same grid as C204's trip row, and the M204 stacked card below `web`).
 *
 * A separate component from `ResultCard` rather than a variant of it: a hotel has no
 * catalog slug and so no detail route, its photo is a remote URL rather than a registry
 * key, and its price is an indicative nightly rate rather than a per-person trip total.
 * Threading a `Trip | PublicHotel` union through every line of ResultCard would make both
 * harder to read than two files.
 *
 * THE NAME IS NOT A LINK. There is no public hotel detail page, and a dead link is worse
 * than no link. The terminal action is a quote request, per §1.3.2.
 *
 * `PublicHotel` has no field for a booking site, so nothing here can render one even by
 * accident — see web/lib/public/hotels.ts.
 */
export function HotelCard({ hotel, next }: { hotel: PublicHotel; next: string }) {
  const quote = joinHref({ intent: "quote", next });
  const rate = hotel.nightlyCents !== null
    ? formatMoney({ amountCents: hotel.nightlyCents, currency: hotel.currency }, { whole: true })
    : null;

  const overline = [
    hotel.hotelClass ? RESULTS.hotels.starClass(hotel.hotelClass) : null,
    hotel.propertyType,
  ].filter(Boolean).join(" · ");

  const sub = (
    <>
      {hotel.rating !== null && (
        <span className="inline-flex items-center gap-1 align-baseline">
          <Icon name="star" size={11} filled className="text-brand-sunset" />
          {hotel.rating}
        </span>
      )}
      {hotel.rating !== null && hotel.reviewCount ? " · " : null}
      {hotel.reviewCount ? RESULTS.hotels.reviews(hotel.reviewCount) : null}
    </>
  );

  const amenities = hotel.amenities.slice(0, 4);

  const price = (
    <>
      <p className="t-label text-on-surface-variant">{RESULTS.hotels.indicative}</p>
      {rate ? (
        <p className="t-title-l my-0.5 text-on-surface">
          {rate}
          <span className="t-fine text-on-surface-variant"> {RESULTS.hotels.perNight}</span>
        </p>
      ) : (
        <p className="t-body-s my-0.5 text-on-surface-variant">{RESULTS.hotels.noRate}</p>
      )}
    </>
  );

  return (
    <>
      {/* Row layout — web (≥1200). */}
      <article className="result-row card hidden p-0 web:grid">
        <div className="relative min-h-30 bg-surface-3">
          {hotel.photos[0] && (
            <Image
              src={hotel.photos[0]}
              alt=""
              fill
              sizes="180px"
              // Google's CDN sees a visitor's IP the moment this loads; sending our URL with
              // it as well is gratuitous. See the privacy page.
              referrerPolicy="no-referrer"
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0 px-4 py-3.5">
          {overline && <span className="t-tag-navy">{overline}</span>}
          <h2 className="t-title-l mt-1.5 mb-0.5 text-on-surface">{hotel.name}</h2>
          <p className="t-body-s text-on-surface-variant">{sub}</p>
          {amenities.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <li key={a} className="chip h-6 px-2 text-on-surface-variant">
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex min-w-42.5 flex-col items-end border-l border-outline-variant px-4 py-3.5 text-right">
          {price}
          <Link href={quote} className="btn btn-filled btn-sm mt-auto">
            {RESULTS.card.quote}
          </Link>
        </div>
      </article>

      {/* Stacked layout — mobile and tablet. */}
      <article className="card web:hidden">
        <div className="relative aspect-video bg-surface-3">
          {hotel.photos[0] && (
            <Image
              src={hotel.photos[0]}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              referrerPolicy="no-referrer"
              className="object-cover"
            />
          )}
          {overline && <span className="t-tag-navy absolute top-2 left-2">{overline}</span>}
        </div>
        <div className="p-3">
          <h2 className="t-title-s text-on-surface">{hotel.name}</h2>
          <p className="t-body-s text-on-surface-variant">{sub}</p>
          <div className={cn("mt-2 flex items-center justify-between gap-2")}>
            <div>{price}</div>
            <Link href={quote} className="btn btn-filled btn-sm">
              {RESULTS.card.quote}
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
