import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { TripBulkStatusForm } from "@/components/agent/TripBulkStatus";
import { TripRosterFilters } from "@/components/agent/TripRosterFilters";
import { TripRosterTable } from "@/components/agent/TripRosterTable";
import { RosterPagination } from "@/components/agent/RosterPagination";
import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import { TRIP_COPY } from "@/lib/agent/content";
import { loadTripRoster } from "@/lib/agent/trips";
import { isDefaultStages, tripQueryFromParams } from "@/lib/agent/tripStatuses";

/**
 * Screen 3.4.1 — Trip List.
 *
 * THE LIST THAT WAS MISSING UNDER A DETAIL THAT ALREADY EXISTED. §3.4.2 shipped 2026-09-25
 * and was reachable only sideways — from the worklist's rows, the pipeline's cards and the
 * calendar's events. The rail's "Trips" entry has always pointed at THIS route, and
 * `nav.test.ts` said so in a comment while the route 404'd.
 *
 * A SERVER COMPONENT, with one client island that holds no selection state — the same shape
 * §3.3.1 settled. Filters are a GET form, the paginator is a pair of links, the bulk
 * selection is the browser's own checkbox state, and everything else lives in the URL.
 *
 * WHAT THE PROTOTYPE DRAWS THAT IS NOT HERE. Its "Filter" button opens a sheet the chips
 * already make unnecessary at this width, and its "Sort · Departure" chip offers a sort with
 * one option — the list is already in departure order, nulls last, because a trip with no
 * dates is an inquiry nobody has planned yet. Its "New trip" CTA is §3.4.3 and renders
 * disabled with its reason, the way quick-add does.
 */

export const metadata = { title: "Trips" };

export default async function AgentTripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = tripQueryFromParams(params);
  const roster = await loadTripRoster(query);

  if (!roster) {
    return (
      <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
        <RetryState />
      </div>
    );
  }

  const filtered = query.search.length > 0;
  const defaultStages = isDefaultStages(query.statuses);

  return (
    <div className="mx-auto w-full max-w-[1336px] px-4 py-6 md:px-8">
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="t-title-l m-0">{TRIP_COPY.title}</h1>
          <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
            {TRIP_COPY.subtitle}
            {roster.pipelineLabel && (
              <>
                {" · "}
                {TRIP_COPY.pipelinePrefix} <strong>{roster.pipelineLabel}</strong>
              </>
            )}
          </p>
        </div>
        {/* Live as of §3.4.3. It shipped disabled with its reason one commit earlier, which
            is the shape §3.2.1 settled for a control whose screen is real but unbuilt. */}
        <Link href="/agent/trips/new" className="btn btn-orange btn-sm shrink-0">
          <Icon name="plus" size={12} /> New trip
        </Link>
      </header>

      <TripRosterFilters query={query} counts={roster.counts} />

      {/* The form wraps BOTH branches so its receipt outlives the rows: moving every trip
          out of the stage you were filtered to empties the list, and a receipt inside the
          non-empty branch would unmount with the table — leaving "Nothing matches" over an
          unexplained blank. That is the §3.3.1 bug, not re-learned here. */}
      <TripBulkStatusForm>
        {roster.rows.length === 0 ? (
          <EmptyState
            icon="trip"
            title={filtered ? TRIP_COPY.emptyFilteredTitle : TRIP_COPY.emptyTitle}
            body={filtered ? TRIP_COPY.emptyFilteredBody : TRIP_COPY.emptyBody}
          />
        ) : (
          <>
            <TripRosterTable rows={roster.rows} />
          </>
        )}
      </TripBulkStatusForm>

      {roster.rows.length > 0 && (
        <RosterPagination
          hrefFor={(p) => {
            const params = new URLSearchParams();
            // Only when the advisor actually picked stages — the default four are not a
            // selection, and writing them into every Next link would make the URL claim one.
            if (!defaultStages) {
              for (const s of query.statuses) params.append("status", s);
            }
            if (query.search) params.set("q", query.search);
            if (p > 1) params.set("page", String(p));
            const qs = params.toString();
            return qs ? `/agent/trips?${qs}` : "/agent/trips";
          }}
          page={roster.page}
          pageCount={roster.pageCount}
          total={roster.total}
          shown={roster.rows.length}
          pageSize={roster.pageSize}
        />
      )}
    </div>
  );
}
