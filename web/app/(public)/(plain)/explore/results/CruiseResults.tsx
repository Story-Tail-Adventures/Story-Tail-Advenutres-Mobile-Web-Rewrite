import { searchCruises } from "@/lib/public/cruises";
import type { SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { CruiseCard } from "./CruiseCard";
import { CruiseState } from "./HotelStates";

/**
 * The Cruises mode's results. Its own component for the same reason `HotelResults` is: it is
 * the only thing on the page that awaits a fetch, so the page can wrap it in Suspense and
 * paint everything else immediately.
 *
 * No precondition guard, unlike hotels. A cruise search with no destination and no dates is
 * a perfectly good question — "what is sailing?" — and answering it costs one indexed query
 * against our own catalog rather than a metered provider request.
 */
export async function CruiseResults({ q }: { q: SearchQuery }) {
  const result = await searchCruises({
    destination: q.dest,
    // The search bar's check-in is a hint about WHEN, not a sailing date to match exactly.
    from: q.checkIn,
  });

  if (result.status === "unavailable") return <CruiseState kind="cruise-unavailable" q={q} />;
  if (result.status === "empty") return <CruiseState kind="cruise-empty" q={q} />;

  return (
    <>
      <ul className="flex flex-col gap-2.5 md:max-web:grid md:max-web:grid-cols-2 md:max-web:gap-3.5">
        {result.sailings.map((sailing) => (
          <li key={sailing.id}>
            <CruiseCard sailing={sailing} />
          </li>
        ))}
      </ul>
      {/* The one line that stands in for the price column this card deliberately lacks. */}
      <p className="t-body-s mt-2.5 text-center text-on-surface-variant">
        {RESULTS.cruises.priceNote}
      </p>
      <p className="t-body-s mt-1 text-center text-on-surface-variant">{RESULTS.footnote}</p>
    </>
  );
}
