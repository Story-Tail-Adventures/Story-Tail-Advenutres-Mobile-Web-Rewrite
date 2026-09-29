import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatDayLong } from "@/lib/public/dates";
import { cn } from "@/lib/cn";
import type { PublicSailing, ShipImage } from "@/lib/public/cruises";
import { requestQuoteHref } from "@/lib/public/links";
import { RESULTS } from "./content";

/**
 * One synced sailing (design: the C204 row, and the 2.3.4 cruise card it is closest to).
 *
 * NO FARE ANYWHERE ON THIS CARD, by construction rather than by omission: `PublicSailing`
 * has no price field, because the Edge Function does not select one. Free-Travel-APIs §4.7 —
 * "launch without it" — is the rule, and §1.3.4/§9.2 are why. The price column that would
 * otherwise sit on the right of a C204 row carries the itinerary instead, which is what
 * someone choosing a cruise is actually reading for. THAT STILL HOLDS — the photo added a
 * column on the left, and took nothing from the itinerary.
 *
 * The whole card is the link, same as a hotel: a sailing has no detail page either, so
 * there is exactly one thing to do with it.
 *
 * THE PHOTO IS A 180px COLUMN ON WEB, not a banner, for the reason HotelCard is a row: an
 * aspect-video header on a 1200px card is most of a viewport, and a results list is meant to
 * be scanned. One set of markup rather than HotelCard's two, because unlike a hotel the body
 * does not change between the layouts — only the photo's box does.
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
    <article
      className={cn(
        "card group relative grid p-0",
        // ONLY TWO COLUMNS WHEN THERE IS SOMETHING TO PUT IN THE FIRST ONE. Most sailings
        // have no photo: the catalog covers 151 curated hulls, but the sync mints a stub
        // `cruise_ship` for any ship name it has not seen, and a stub has no imagery. An
        // unconditional `web:grid-cols-[180px_1fr]` left those cards with a 180px hole.
        sailing.shipImage && "web:grid-cols-[180px_1fr]",
      )}
    >
      {sailing.shipImage && (
        <div className="relative aspect-video bg-surface-3 web:aspect-auto web:h-full web:min-h-30">
          <Image
            src={sailing.shipImage.url}
            // Decorative: the ship's name is already read out one element below, so a
            // description here would announce it twice. Same call HotelCard makes.
            alt=""
            fill
            sizes="(min-width: 1200px) 180px, 100vw"
            // Wikimedia sees the visitor's IP the moment this loads; sending the page they
            // were on as well is gratuitous. Same reasoning as the hotel photos.
            referrerPolicy="no-referrer"
            className="object-cover"
          />
        </div>
      )}
      <div className="min-w-0 px-4 py-3.5 web:px-4.5">
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

        {sailing.shipImage && <PhotoCredit image={sailing.shipImage} />}

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

/**
 * The attribution line. THIS IS A LICENCE CONDITION, NOT A CAPTION.
 *
 * Every ship photo is CC BY or CC BY-SA, and both require credit wherever the work appears.
 * `PublicSailing` cannot carry a photo without one — `ShipImage` nests the pair, the Edge
 * Function drops a photo whose credit is missing, and `cruise_ship_image_attributed` stops
 * the pair being half-written in the first place. This component is the end of that chain:
 * if it is deleted, the photo above becomes a breach, so it is rendered by the same
 * `sailing.shipImage &&` guard rather than by a separate condition that could drift.
 *
 * IT IS NOT TRUNCATED, and that rules out the tidier designs. Commons attribution runs to
 * whole sentences — the longest in the catalog is 214 characters — and an ellipsis through
 * the middle of an author's name is not attribution. So it sits at full card width under the
 * body, where it can wrap, rather than overlaid on a 180px-wide photo where it could not.
 *
 * `relative z-2` lifts the Commons link above `.link-stretch::after`, which covers the card
 * at `z-index: 1`. Without it the anchor renders, reads correctly to a screen reader, and
 * cannot be clicked — the card swallows every press.
 */
function PhotoCredit({ image }: { image: ShipImage }) {
  return (
    <p className="t-fine mt-2 text-on-surface-variant">
      {RESULTS.cruises.photoCredit}{" "}
      {image.sourceUrl ? (
        <a
          href={image.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-2 underline underline-offset-2 hover:text-on-surface"
        >
          {image.credit}
        </a>
      ) : (
        image.credit
      )}
    </p>
  );
}

/** Departure + nights, as a civil date. Kept off `Date` arithmetic for the usual reason. */
function addNights(iso: string, nights: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + nights);
  return date.toISOString().slice(0, 10);
}
