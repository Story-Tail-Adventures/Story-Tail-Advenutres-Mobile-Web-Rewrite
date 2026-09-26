import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientTripRow } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.4 — every trip this client has, current and past.
 *
 * THE THREE CHIPS ARE COUNTS OVER ONE ROW SET, not three reads. `agent_client_trips`
 * returns the client's whole book once and `bucket` is computed in the view model; asking
 * the database three times for three slices of the same rows would be three round trips to
 * render one tab.
 *
 * ROWS LINK INTO §3.4.2, which is the first cross-section link on the agent side and the
 * reason the roster's rows do NOT link anywhere: trip detail is built, client detail was
 * not until now. `/agent/trips/[tripId]` is a real route.
 *
 * NO IMAGES. The prototype draws a 120px photo on every row. `trip` has no image column —
 * the client-side trip cards use curated content keyed by destination, which is a Phase 2
 * catalog concern — so a row that reserved space for one would render a grey box on every
 * line. Dropped rather than faked, the same call §3.2.1's KPI deltas got.
 */
export function ClientTripsTab({ trips }: { trips: ClientTripRow[] }) {
  if (trips.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {CLIENT_COPY.tripsEmpty}
      </p>
    );
  }

  const counts = {
    active: trips.filter((t) => t.bucket === "active").length,
    past: trips.filter((t) => t.bucket === "past").length,
    cancelled: trips.filter((t) => t.bucket === "cancelled").length,
  };

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="chip">{`${CLIENT_COPY.tripsActive} · ${counts.active}`}</span>
        <span className="chip">{`${CLIENT_COPY.tripsPast} · ${counts.past}`}</span>
        <span className="chip">{`${CLIENT_COPY.tripsCancelled} · ${counts.cancelled}`}</span>
        <button
          type="button"
          disabled
          title={CLIENT_COPY.newTripForClientDeferred}
          className="btn btn-orange btn-sm ml-auto opacity-50"
        >
          <Icon name="plus" size={12} /> New trip
          <span className="sr-only"> — {CLIENT_COPY.newTripForClientDeferred}</span>
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {trips.map((t) => (
            <li key={t.tripId}>
              <Link
                href={`/agent/trips/${t.tripId}`}
                className="card flex flex-wrap items-center gap-3 px-3.5 py-3 hover:bg-[var(--md-surface-2)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-title-s block truncate">{t.title}</span>
                  <span className="t-body-s block truncate text-[var(--md-on-surface-variant)]">
                    {[t.datesLabel, t.destinations[0]].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[13px] font-bold">{t.valueLabel}</span>
                  <span className="t-body-s block text-[var(--md-on-surface-variant)]">
                    {CLIENT_COPY.tripCommissionPrefix} {t.commissionLabel}
                  </span>
                </span>
                <span className={`chip-status ${t.statusChip} shrink-0`}>{t.statusLabel}</span>
              </Link>
            </li>
        ))}
      </ul>
    </>
  );
}
