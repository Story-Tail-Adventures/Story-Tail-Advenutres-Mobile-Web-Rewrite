import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";

import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RevenueChart } from "@/components/agent/reports/RevenueChart";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { loadRevenue } from "@/lib/agent/reports";
import {
  PERIOD_NAMES,
  periodChips,
  readBasis,
  readCompare,
  readPeriod,
  REVENUE_BASES,
  reportExportHref,
  reportStateHref,
} from "@/lib/agent/reportsView";
import { REPORTS_COPY, reportTotalFor } from "@/lib/agent/reportsCopy";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.11.2 — Revenue by Month (P1). Rulings: Screen Inventory §3.11, "Ruled 2026-10-21".
 *
 * TWO VIEWS, ONE TOGGLE. Story-Tail never charges clients, so its own income is commission:
 * "Booked value" (default) is gross trip value by the month a trip was FIRST booked;
 * "Commission received" is ledger money by the day it arrived, the tax-prep figure.
 *
 * YEAR OVER YEAR only once there is a last year: the compare link appears when some month in
 * the window has a figure a year back. Every control is a link, so the state is in the URL.
 */

export const metadata = { title: "Revenue by month" };

type Params = { period?: string | string[]; basis?: string | string[]; compare?: string | string[] };

export default async function RevenueReportPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const period = readPeriod(params.period);
  const basis = readBasis(params.basis);
  const compare = readCompare(params.compare);
  const data = await loadRevenue(period, basis);

  const shell = {
    title: REPORTS_COPY.revenueTitle,
    subtitle: REPORTS_COPY.revenueSubtitle,
    chips: periodChips("revenue", period, { basis, compare }),
    exportHref: reportExportHref("revenue", period, basis),
    windowLabel: data?.window.rangeLabel ?? null,
  };

  if (!data) {
    return (
      <ReportShell {...shell}>
        <RetryState />
      </ReportShell>
    );
  }

  const controls = (
    <Box sx={{ mb: 1.75, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
      <Box component="nav" aria-label={REPORTS_COPY.basisLabel} sx={{ display: "flex", gap: 0.75 }}>
        {REVENUE_BASES.map((b) => (
          <Chip
            key={b}
            component={NextLink}
            href={reportStateHref("revenue", { period, basis: b, compare })}
            scroll={false}
            clickable
            label={b === "booked" ? REPORTS_COPY.basisBooked : REPORTS_COPY.basisReceived}
            color={b === basis ? "primary" : "default"}
            variant={b === basis ? "filled" : "outlined"}
            aria-current={b === basis ? "true" : undefined}
            sx={TAP_TARGET}
          />
        ))}
      </Box>
      {data.report.hasPrior && (
        <MuiLink
          component={NextLink}
          href={reportStateHref("revenue", { period, basis, compare: !compare })}
          scroll={false}
          underline="hover"
          variant="body2"
          sx={{ ml: { sm: "auto" }, fontWeight: 600, ...TAP_TARGET }}
        >
          {compare ? REPORTS_COPY.compareHide : REPORTS_COPY.compareShow}
        </MuiLink>
      )}
    </Box>
  );

  return (
    <ReportShell {...shell} controls={controls}>
      <RevenueChart
        report={data.report}
        basis={basis}
        compare={compare}
        totalCaption={reportTotalFor(PERIOD_NAMES[period])}
      />
      <ReportNote>{basis === "booked" ? REPORTS_COPY.revenueBookedNote : REPORTS_COPY.revenueReceivedNote}</ReportNote>
      {basis === "booked" && <ReportNote>{REPORTS_COPY.trackingSince}</ReportNote>}
    </ReportShell>
  );
}
