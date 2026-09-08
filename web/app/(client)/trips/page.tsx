import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { formatTripDates } from "@/lib/trips/format";
import { isTripFilter, loadTrips, type DashboardTrip, type TripFilter } from "@/lib/trips/queries";
import { TRIPS } from "./content";

export const metadata: Metadata = { title: "My trips" };

/**
 * Screen 2.2.2 All Trips List — see docs/Screen-Inventory.md §2.2.2 and §4.4 (Pattern B,
 * with no stated deviation, so it follows Pattern B's defaults) and
 * design/source-prototype/screens/client-trip.jsx (C222_AllTrips) + client-trip-mobile.jsx
 * (M222_AllTrips). P1.
 *
 * The filter lives in the URL rather than in client state, which is what makes a tab
 * shareable, back-button-correct and server-rendered. Pattern B's mobile guidance puts
 * search and sort behind icon buttons; both are absent here rather than inert — §4.3 sizes
 * the account at a handful of trips, so a search field over four rows is furniture, and
 * there is no second sort order anybody has asked for yet.
 *
 * DEPARTURE FROM PATTERN B: it is a card list at every width, not a data table on web.
 * Pattern B's web column ("true data table with sortable headers, right-click menu,
 * bulk-select") is written for the AGENT surface, where a hundred rows need scanning. A
 * traveler has four trips and each one is a photograph they recognise before they read the
 * title — the artboard draws image-led cards at 1280px for that reason.
 */
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: raw } = await searchParams;
  const filter: TripFilter = isTripFilter(raw) ? raw : "all";
  const data = await loadTrips(filter);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
        {/* §5's ERROR state, not the empty one — see the note on the dashboard's. */}
        <RetryState title={TRIPS.errorTitle} body={TRIPS.errorBody} />
      </div>
    );
  }

  const tabs: Array<{ id: TripFilter; label: string }> = [
    { id: "all", label: TRIPS.tabAll },
    { id: "upcoming", label: TRIPS.tabUpcoming },
    { id: "planning", label: TRIPS.tabPlanning },
    { id: "past", label: TRIPS.tabPast },
    { id: "cancelled", label: TRIPS.tabCancelled },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-10 md:p-6">
      <h1 className="t-headline">{TRIPS.title}</h1>
      <p className="t-body mt-1 max-w-prose text-on-surface-variant">{TRIPS.subtitle}</p>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filter trips">
        {tabs.map((tab) => {
          const on = tab.id === filter;
          return (
            <Link
              key={tab.id}
              href={tab.id === "all" ? "/trips" : `/trips?filter=${tab.id}`}
              className={`chip tap-44 shrink-0 ${on ? "chip-filter is-on" : "chip-filter"}`}
              aria-current={on ? "page" : undefined}
            >
              {tab.label} · {data.counts[tab.id]}
            </Link>
          );
        })}
      </nav>

      {data.trips.length === 0 ? (
        <EmptyState
          icon="palm"
          title={filter === "all" ? TRIPS.emptyAllTitle : TRIPS.emptyFilteredTitle}
          body={filter === "all" ? TRIPS.emptyAllBody : TRIPS.emptyFilteredBody}
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {data.trips.map((trip) => (
            <li key={trip.id}>
              <TripRow trip={trip} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The artboard's `200px | 1fr | auto` row on web, collapsing to image-top below `md:`.
 *
 * Trip value is shown because `total_value_cents` is in the client column grant and it is
 * what the trip costs THEM — not `total_commission_cents`, which is the agency's number and
 * is withheld (BRD §10.5).
 */
function TripRow({ trip }: { trip: DashboardTrip }) {
  return (
    <Link
      href={`/trips/${trip.id}`}
      className="card grid grid-cols-1 overflow-hidden p-0 md:grid-cols-[200px_1fr_auto]"
    >
      <div className="relative h-[140px] md:h-full">
        <Photo
          image={imageKeyForTrip(trip)}
          alt=""
          fill
          sizes="(min-width: 768px) 200px, 100vw"
          className="object-cover"
        />
        <span className={`chip-status ${trip.chip} absolute left-2.5 top-2.5 md:hidden`}>
          {trip.statusLabel}
        </span>
      </div>

      <div className="p-4">
        <span className={`chip-status ${trip.chip} hidden md:inline-flex`}>{trip.statusLabel}</span>
        <div className="t-title-l mt-1.5">{trip.title}</div>
        <div className="t-body-s text-on-surface-variant">
          {[formatTripDates(trip.startDate, trip.endDate), trip.destinations[0], `${trip.travelerCount} travelers`]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-outline-variant p-4 md:min-w-[160px] md:flex-col md:items-end md:justify-start md:border-l md:border-t-0">
        <div>
          <div className="t-label text-on-surface-variant">{TRIPS.tripValue}</div>
          <div className="t-title-l">{formatTripMoney(trip.totalValueCents, trip.currency)}</div>
        </div>
        <span className="btn btn-tonal btn-sm md:mt-auto">
          {TRIPS.open} <Icon name="chevron_right" size={13} />
        </span>
      </div>
    </Link>
  );
}
