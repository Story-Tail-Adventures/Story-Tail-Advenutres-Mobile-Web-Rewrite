import { claim } from "@/content/public/proof";
import { searchHotels } from "@/lib/public/hotels";
import { formatDayLong } from "@/lib/public/dates";
import { RATE_BANDS, resultsHref, serpSortBy, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { HotelCard } from "./HotelCard";
import { HotelState } from "./HotelStates";

/**
 * The only thing on this page that awaits a network call, which is why it is its own
 * component: the page wraps it in Suspense so the header, rail and heading paint straight
 * away and only the rows wait.
 *
 * THE PRECONDITION IS THE FIRST QUOTA CONTROL. No destination or no dates means no request
 * at all — a hotel search without either is meaningless to the provider and would spend a
 * metered call to return noise. A crawler following `/explore/results?dest=Aruba` gets the
 * prompt state and never touches the provider.
 */
export async function HotelResults({ q, current }: { q: SearchQuery; current: string }) {
  if (!q.dest) return <HotelState kind="need-destination" q={q} />;
  if (!q.checkIn || !q.checkOut) return <HotelState kind="need-dates" q={q} />;

  const band = RATE_BANDS.filter((b) => q.rates.includes(b.id));
  const result = await searchHotels({
    destination: q.dest,
    checkIn: q.checkIn,
    checkOut: q.checkOut,
    adults: q.travelers ?? 2,
    hotelClass: q.stars,
    amenities: q.amenities,
    // Several bands selected widen to their union rather than intersecting to nothing.
    minPrice: band.length ? (band.every((b) => b.min !== null) ? Math.min(...band.map((b) => b.min!)) : null) : null,
    maxPrice: band.length ? (band.some((b) => b.max === null) ? null : Math.max(...band.map((b) => b.max!))) : null,
    sortBy: serpSortBy(q.sort),
  });

  if (result.status === "budget_exhausted") return <HotelState kind="exhausted" q={q} />;
  if (result.status === "unavailable") return <HotelState kind="unavailable" q={q} />;
  if (result.status === "empty") return <HotelState kind="empty" q={q} />;

  // The instant is sliced to a calendar day before formatting: `formatDayLong` treats its
  // input as a civil date, which is the only reading that does not shift under a timezone.
  const staleLabel = result.stale ? formatDayLong(result.stale.slice(0, 10)) : null;

  return (
    <>
      <ul className="flex flex-col gap-2.5 md:max-web:grid md:max-web:grid-cols-2 md:max-web:gap-3.5">
        {result.hotels.map((hotel) => (
          <li key={hotel.id}>
            <HotelCard hotel={hotel} next={current} />
          </li>
        ))}
      </ul>
      {/* Screen Inventory §5's stale-data state: when we know the figures may have moved,
          say so with a timestamp rather than presenting them as live. */}
      {staleLabel && (
        <p className="t-body-s mt-2.5 text-center text-on-surface-variant">
          {RESULTS.hotels.staleAsOf(staleLabel)}
        </p>
      )}
      <p className="t-body-s mt-2.5 text-center text-on-surface-variant md:mt-2">
        {claim("hotelRateBasis")}
      </p>
      <p className="t-body-s mt-1 text-center text-on-surface-variant">
        <a href={resultsHref({ ...q, mode: "picks" })} className="underline">
          {RESULTS.hotels.seePicks}
        </a>
      </p>
    </>
  );
}
