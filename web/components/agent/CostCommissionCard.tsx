import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { EMPTY_LEDGER_QUERY, ledgerHref } from "@/lib/agent/commissionFilters";
import { AGENT_COPY, COMMISSION_COPY } from "@/lib/agent/content";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";

/**
 * The prototype's "Cost & commission" sidebar card, from `agent_trip_overview`'s figures —
 * drawn as the artboard draws it (A342_TripDetail's sidebar): body2 rows, the commission
 * row in h6 on primary. Every figure arrives formatted; nothing is computed here.
 *
 * The link under the commission figure is §3.7.2's second entry point. That figure is the
 * FORECAST (the sum of this trip's components); the ledger lines are what was invoiced and
 * paid, and the two are allowed to disagree — that disagreement is what §3.7.6 is for. The
 * link always shows: a trip with no lines lands on a ledger that says it has not been
 * invoiced yet, which is the answer the advisor clicked for.
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
        <MuiLink
          component={NextLink}
          href={ledgerHref({ ...EMPTY_LEDGER_QUERY, tripId: overview.tripId })}
          underline="hover"
          variant="body2"
          sx={{ display: "inline-block", mt: 0.5 }}
        >
          {COMMISSION_COPY.tripLedgerLink}
        </MuiLink>
      </CardContent>
    </Card>
  );
}
