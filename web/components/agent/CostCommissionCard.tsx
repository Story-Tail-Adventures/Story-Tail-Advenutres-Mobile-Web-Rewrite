import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";

/**
 * The prototype's "Cost & commission" sidebar card, from `agent_trip_overview`'s figures —
 * drawn as the artboard draws it (A342_TripDetail's sidebar): body2 rows, the commission
 * row in h6 on primary. Every figure arrives formatted; nothing is computed here.
 */
export function CostCommissionCard({ overview }: { overview: TripDetailOverview }) {
  return (
    <Card>
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {AGENT_COPY.costCommissionTitle}
        </Typography>
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: 1 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {AGENT_COPY.clientTotalLabel}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {overview.totalValueLabel}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {AGENT_COPY.paidSoFarLabel}
          </Typography>
          <Typography variant="body2">{overview.totalPaidLabel}</Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.75, color: "primary.main" }}>
          <Typography variant="h6">{AGENT_COPY.commissionLabel}</Typography>
          <Typography variant="h6">{overview.totalCommissionLabel}</Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
