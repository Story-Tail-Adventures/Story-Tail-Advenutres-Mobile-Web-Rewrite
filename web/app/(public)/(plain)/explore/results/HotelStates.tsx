import Link from "next/link";
import { inquiryHref } from "@/lib/public/inquiry";
import { resultsHref, type SearchQuery } from "@/lib/public/search";
import { RESULTS } from "./content";
import { SEARCH_ANCHOR } from "./SearchUpdateBar";

export type HotelStateKind =
  | "need-destination"
  | "need-dates"
  | "empty"
  | "unavailable"
  | "exhausted"
  | "cruise-empty"
  | "cruise-unavailable";

const COPY = {
  "need-destination": RESULTS.hotels.needDestination,
  "need-dates": RESULTS.hotels.needDates,
  empty: RESULTS.hotels.empty,
  unavailable: RESULTS.hotels.unavailable,
  exhausted: RESULTS.hotels.exhausted,
  "cruise-empty": RESULTS.cruises.empty,
  "cruise-unavailable": RESULTS.cruises.unavailable,
} as const;

/**
 * The five ways hotels mode can have nothing to show.
 *
 * Never a dead end — the same rule EmptyResults follows. Every one of these offers the
 * curated catalog and a way to reach Gyasi, because a visitor who came looking for a week
 * away should not leave holding an error.
 *
 * There is deliberately NO "try again" button on the unavailable state: a link to the same
 * URL will not refetch inside the cache window, and a retry that does nothing is worse than
 * an honest offer of the alternative.
 */
export function HotelState({ kind, q }: { kind: HotelStateKind; q: SearchQuery }) {
  const copy = COPY[kind];
  return (
    <div className="card p-8 text-center">
      <h2 className="t-title-l text-on-surface">{copy.title}</h2>
      <p className="t-body mx-auto mt-1.5 max-w-125 text-on-surface-variant">{copy.body}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {(kind === "need-destination" || kind === "need-dates") && (
          // An anchor to the form at the top of this page, NOT a link to /explore — which
          // was blank, so "change your search" meant "retype your search".
          <a href={`#${SEARCH_ANCHOR}`} className="btn btn-tonal">
            {RESULTS.hotels.editSearch}
          </a>
        )}
        <Link href={resultsHref({ ...q, mode: "picks" })} className="btn btn-tonal">
          {RESULTS.hotels.seePicks}
        </Link>
        <a href={inquiryHref({ source: "results" })} className="btn btn-text">
          {RESULTS.empty.message}
        </a>
      </div>
    </div>
  );
}

/** The cruise modes reuse the same shell — same rule, same CTAs, different copy. */
export const CruiseState = HotelState;
