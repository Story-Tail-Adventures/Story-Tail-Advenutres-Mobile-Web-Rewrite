import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { AgentViews } from "@/components/agent/AgentViews";
import { CashInCalendar } from "@/components/agent/CashInCalendar";
import { ForecastStagesCard } from "@/components/agent/ForecastStagesCard";
import { RetryState } from "@/components/client/RetryState";
import { COMMISSION_COPY, FORECAST_COPY } from "@/lib/agent/content";
import { loadCommissionForecast } from "@/lib/agent/forecast";
import { AGENT_COMMISSION_VIEWS } from "@/lib/agent/nav";

/**
 * Screen 3.7.7 — Commission Forecast / Pipeline View. §4.4 Pattern D, web only.
 *
 * A377_Forecast's two cards side by side from `lg`: the weighted forecast by stage (weights
 * adjustable, and saved) and the cash-in calendar. Gyasi's rulings (2026-10-12):
 *
 *  - The forecast covers EVERY open trip, so its totals are the worklist's own: that tile shows
 *    the unweighted total and the confidence, which the caption here repeats, under the
 *    weighted total. The artboard's "Next 12 months" chip becomes "All open trips"; the
 *    calendar is the part that runs twelve months.
 *  - The calendar is that forecast by month, dated by each supplier's terms (60 days after
 *    travel when there are none), less money already received.
 *  - Saving a weight changes the worklist's confidence too.
 *
 * NO "QUALIFIED" ROW. The artboard draws one; trips have no such status, and Data-Model §7.4's
 * four open stages are the authority (the artboard's own numbers do not add up to its total).
 */

export const metadata = { title: "Commission forecast" };

export default async function CommissionForecastPage() {
  const forecast = await loadCommissionForecast();

  return (
    <Box sx={PAGE_SX}>
      <AgentViews views={AGENT_COMMISSION_VIEWS} label={COMMISSION_COPY.viewsLabel} />

      <Box component="header" sx={{ mt: 2.5, mb: 2, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1.5 }}>
        <Box sx={{ minWidth: 0, flex: "1 1 260px" }}>
          <Typography component="h1" variant="h5" sx={{ m: 0 }}>
            {FORECAST_COPY.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
            {FORECAST_COPY.subtitle}
          </Typography>
        </Box>
        <Chip variant="outlined" label={FORECAST_COPY.scopeChip} />
      </Box>

      {!forecast ? (
        <RetryState />
      ) : (
        <>
          {!forecast.anyCommission && (
            <Typography component="p" variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
              {FORECAST_COPY.nothingYet}
            </Typography>
          )}
          <Box
            sx={{
              display: "grid",
              // Side by side from `lg`: at a tablet's width each card was too narrow for the
              // stage rows' bars (review measured 3px at 768).
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
              gap: 1.75,
              alignItems: "start",
            }}
          >
            <ForecastStagesCard
              totalLabel={forecast.totalLabel}
              acrossLabel={forecast.acrossLabel}
              stages={forecast.stages}
              currency={forecast.currency}
            />
            <CashInCalendar rows={forecast.calendar} receivedNote={forecast.receivedNote} />
          </Box>
        </>
      )}
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;
