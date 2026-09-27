import Link from "next/link";

import { SelectAllTrips } from "@/components/agent/TripBulkStatus";
import { TRIP_COPY } from "@/lib/agent/content";
import type { TripRosterRow } from "@/lib/agent/trips";

/**
 * Screen 3.4.1's rows — §4.4 Pattern B, web half.
 *
 * ONE STRUCTURE, NOT §3.3.1's TWO. That screen builds a real `<table>` for the desk AND a
 * real card list for the phone, because Clients is one of the four agent tabs on a phone.
 * Trips is not (§6.6), and §3.4 has no phone artboards at all — so a second structure here
 * would be markup nobody can reach, kept in step by hand forever.
 *
 * EVERY ROW CARRIES ITS STAGE INTO THE CHECKBOX, as `tripId:fromStatus`. Setting a stage
 * overwrites, so the bulk write refuses to move a trip whose stage has changed since this
 * page rendered — and the value is where it learns what the page was showing.
 */
export function TripRosterTable({ rows }: { rows: TripRosterRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--md-on-surface-variant)]">
            {/* Fixed width so the columns do not shift when the select-all appears on
                hydration. See SelectAllTrips. */}
            <th scope="col" className="w-10 px-3.5 py-2.5 text-left">
              <SelectAllTrips />
            </th>
            <th scope="col" className="px-3.5 py-2.5 text-left">{TRIP_COPY.colTrip}</th>
            <th scope="col" className="px-3.5 py-2.5 text-left">{TRIP_COPY.colClient}</th>
            <th scope="col" className="px-3.5 py-2.5 text-left">{TRIP_COPY.colTravel}</th>
            <th scope="col" className="px-3.5 py-2.5 text-left">{TRIP_COPY.colStage}</th>
            <th scope="col" className="px-3.5 py-2.5 text-right">{TRIP_COPY.colValue}</th>
            <th scope="col" className="px-3.5 py-2.5 text-right">{TRIP_COPY.colCommission}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tripId} className="border-t border-[var(--md-outline-variant)]">
              <td className="px-3.5 py-2.5">
                <input
                  type="checkbox"
                  name="trip"
                  value={`${row.tripId}:${row.status}`}
                  aria-label={`${TRIP_COPY.bulkSelectRow} ${row.title}`}
                  className="bulk-pick size-4 cursor-pointer accent-[var(--md-primary)]"
                />
              </td>
              <td className="px-3.5 py-2.5">
                <Link href={`/agent/trips/${row.tripId}`} className="min-w-0 hover:underline">
                  <span className="t-title-s block truncate">{row.title}</span>
                  <span className="t-body-s block truncate text-[var(--md-on-surface-variant)]">
                    {row.destinationLabel ?? TRIP_COPY.noDestination}
                    {row.componentCount > 0 && ` · ${row.componentCount}`}
                  </span>
                </Link>
              </td>
              <td className="px-3.5 py-2.5 text-[12.5px] text-[var(--md-on-surface-variant)]">
                <Link href={`/agent/clients/${row.clientId}`} className="hover:underline">
                  {row.clientName}
                </Link>
              </td>
              <td className="px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--md-on-surface-variant)]">
                {row.travelLabel ?? TRIP_COPY.noDates}
              </td>
              <td className="px-3.5 py-2.5">
                <span className={`chip-status ${row.statusChip}`}>{row.statusLabel}</span>
              </td>
              <td className="px-3.5 py-2.5 text-right font-mono text-[12.5px] font-bold">
                {row.valueLabel}
              </td>
              <td className="px-3.5 py-2.5 text-right font-mono text-[12.5px] text-[var(--md-primary)]">
                {row.commissionLabel ?? TRIP_COPY.noCommission}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
