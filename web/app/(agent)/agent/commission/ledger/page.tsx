import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { CommissionHeader } from "@/components/agent/CommissionHeader";
import { CommissionLedgerFilters } from "@/components/agent/CommissionLedgerFilters";
import { CommissionLedgerTable } from "@/components/agent/CommissionLedgerTable";
import { RosterPagination } from "@/components/agent/RosterPagination";
import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { loadCommissionLedger } from "@/lib/agent/commission";
import {
  isFiltered,
  ledgerHref,
  ledgerQueryFromParams,
  type LedgerParams,
} from "@/lib/agent/commissionFilters";
import { COMMISSION_COPY } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";

/**
 * Screen 3.7.2 — Commission Ledger ("Commission List" in the Screen Inventory; the artboard
 * calls it the ledger, and so does every comment since the forecast/ledger split). §4.4
 * Pattern B.
 *
 * ONE ROW PER COMMISSION LINE, not per trip. A trip can carry several suppliers' lines, and
 * most booked trips carry none yet — a trip with no line has not been invoiced, which is a
 * state the advisor is in, not a gap in this list.
 *
 * FIVE STATUS CHIPS, NOT THE PROTOTYPE'S FOUR: it draws no Lost, and a line lost to a
 * cancellation would have no way back onto the screen. None ticked means every status.
 *
 * ENTRY POINTS (Screen Inventory §3.7.2): the Dashboard view strip, and Trip Detail's cost
 * card, which arrives with `?trip=` and gets a removable "One trip" chip here.
 *
 * Stage 1 is read-only. The trip title links to Trip Detail (unless the trip is archived —
 * its line stays, as a tax record, but the trip page will not open); opening a LINE is
 * §3.7.3, and the footer says so.
 */

export const metadata = { title: "Commission ledger" };

export default async function CommissionLedgerPage({
  searchParams,
}: {
  searchParams: Promise<LedgerParams>;
}) {
  const query = ledgerQueryFromParams(await searchParams);
  const ledger = await loadCommissionLedger(query);

  const header = (
    <>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />
      <CommissionHeader
        title={COMMISSION_COPY.ledgerTitle}
        subtitle={COMMISSION_COPY.ledgerSubtitle}
        actions={[
          { label: COMMISSION_COPY.exportLabel, reason: COMMISSION_COPY.exportDeferred, icon: "download" },
        ]}
      />
    </>
  );

  if (!ledger) {
    return (
      <Box sx={PAGE_SX}>
        {header}
        <RetryState />
      </Box>
    );
  }

  // Past the last page — a bookmark or a stale tab, since the form never posts `page`. An
  // empty page carries no `total_count` to read, so it would claim "no commission lines yet"
  // over a ledger that has them. Start the same view from the top instead.
  if (ledger.rows.length === 0 && query.page > 1) {
    redirect(ledgerHref({ ...query, page: 1 }));
  }

  // Order matters. A one-trip view narrowed further (a status, a supplier, dates) that comes
  // back empty is "nothing matches", not "this trip has no lines" — it may have several.
  const narrowedBeyondTrip = isFiltered({ ...query, tripId: null });
  const empty = narrowedBeyondTrip
    ? { title: COMMISSION_COPY.emptyFilteredTitle, body: COMMISSION_COPY.emptyFilteredBody }
    : query.tripId
      ? { title: COMMISSION_COPY.emptyTripTitle, body: COMMISSION_COPY.emptyTripBody }
      : { title: COMMISSION_COPY.emptyTitle, body: COMMISSION_COPY.emptyBody };

  return (
    <Box sx={PAGE_SX}>
      {header}

      {query.tripId && (
        <Box sx={{ mb: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          {/* The title is read off a row, so a narrowed view with no rows has none to show.
              Rather than a dangling "One trip:", the chip then says what it filters by. */}
          <Chip
            color="secondary"
            label={ledger.tripTitle
              ? `${COMMISSION_COPY.tripFilterPrefix} ${ledger.tripTitle}`
              : COMMISSION_COPY.tripFilterUnnamed}
          />
          <MuiLink
            component={NextLink}
            href={ledgerHref({ ...query, tripId: null, page: 1 })}
            underline="hover"
            variant="body2"
          >
            {COMMISSION_COPY.tripFilterRemove}
          </MuiLink>
        </Box>
      )}

      <CommissionLedgerFilters query={query} counts={ledger.counts} suppliers={ledger.suppliers} />

      {ledger.rows.length === 0 ? (
        <EmptyState icon="receipt" title={empty.title} body={empty.body} />
      ) : (
        <>
          <CommissionLedgerTable rows={ledger.rows} />
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary", opacity: 0.8 }}>
            {COMMISSION_COPY.lineDetailDeferred}
          </Typography>
          <RosterPagination
            hrefFor={(p) => ledgerHref({ ...query, page: p })}
            page={ledger.page}
            pageCount={ledger.pageCount}
            total={ledger.total}
            shown={ledger.rows.length}
            pageSize={ledger.pageSize}
            label={COMMISSION_COPY.ledgerPagesLabel}
          />
        </>
      )}
    </Box>
  );
}

/** The page column — the Trips list's width, which a seven-column money table needs. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
