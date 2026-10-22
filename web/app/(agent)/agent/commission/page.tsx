import Box from "@mui/material/Box";

import { AgentViews } from "@/components/agent/AgentViews";
import { CommissionHeader } from "@/components/agent/CommissionHeader";
import { CommissionTrendChart } from "@/components/agent/CommissionTrendChart";
import { KpiTile } from "@/components/agent/KpiTile";
import { RetryState } from "@/components/client/RetryState";
import { loadCommissionDashboard } from "@/lib/agent/commission";
import { COMMISSION_COPY } from "@/lib/agent/content";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";

/**
 * Screen 3.7.1 — Commission Dashboard. §4.4 Pattern D: KPI cards near the top, a carousel
 * on a phone, then one summary card.
 *
 * THE PROTOTYPE'S FOUR TILES, NOT SCREEN INVENTORY §3.7.1's. Gyasi ruled on 2026-10-11, and
 * settled the two that read two ways: "Expected · 90d" is TRIP-grain (booked trips starting
 * within 90 days, plus every trip in progress, from trip totals), and "At risk" is the
 * UNPAID GAP on disputed lines rather than their full expected amount. The migration that
 * built `agent_commission_dashboard()` carries the reasoning; §3.7.1 carries the amendment.
 *
 * EVERY ACTION THE PROTOTYPE DRAWS IS LIVE. "Export" since Stage 2, once each download could
 * write its own audit row (Data-Model §18.3); "Import CSV" since Stage 3 (§3.7.5).
 *
 * WHAT IS HERE THAT THE PROTOTYPE DOES NOT DRAW: the Dashboard / Ledger / Statements view strip. See
 * `AGENT_COMMISSION_VIEWS` for why.
 *
 * A Server Component throughout. Every figure arrives formatted from `lib/agent/commission.ts`,
 * and every date boundary was drawn by the accessor in the agent's own time zone.
 */

export const metadata = { title: "Commissions" };

export default async function CommissionDashboardPage() {
  const dashboard = await loadCommissionDashboard();

  return (
    <Box sx={PAGE_SX}>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />

      <CommissionHeader
        title={COMMISSION_COPY.title}
        subtitle={COMMISSION_COPY.subtitle}
        actions={[
          { label: COMMISSION_COPY.importLabel, href: "/agent/commission/import", icon: "upload" },
          // Unfiltered from here: the dashboard has no filters to carry.
          { label: COMMISSION_COPY.exportLabel, href: "/agent/commission/ledger/export", icon: "download", download: true },
        ]}
      />

      {/* Null means the READ failed. A new advisor's dashboard is one row of zeros and
          renders as tiles saying so. */}
      {!dashboard ? (
        <RetryState />
      ) : (
        <>
          <Box sx={KPIS_SX}>
            {dashboard.tiles.map((t) => (
              <KpiTile key={t.id} kpi={t} />
            ))}
          </Box>
          <CommissionTrendChart
            months={dashboard.months}
            anyReceived={dashboard.anyReceived}
            trendChange={dashboard.trendChange}
          />
        </>
      )}
    </Box>
  );
}

/** The page column — the Trips list's width, so switching to the ledger does not shift it. */
const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;

/**
 * The tile rail: a snap carousel below `md` (Pattern D), two across through the tablet band,
 * and the artboard's four across from §4.2's web breakpoint. Four at 768px would leave each
 * tile's content box narrower than a six-figure amount at 26px — the arithmetic the
 * worklist's rail header works through for five.
 */
const KPIS_SX = {
  mb: 1.75,
  display: { xs: "flex", md: "grid" },
  gap: 1.25,
  overflowX: { xs: "auto", md: "visible" },
  scrollSnapType: "x mandatory",
  pb: 0.25,
  gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))", web: "repeat(4, minmax(0, 1fr))" },
} as const;
