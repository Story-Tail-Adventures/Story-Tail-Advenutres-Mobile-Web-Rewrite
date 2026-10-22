import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { FunnelChart } from "@/components/agent/reports/ClientsAndFunnel";
import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { loadFunnelReport } from "@/lib/agent/reports";
import { periodChips, readPeriod, reportExportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * Screen 3.11.6 — Conversion Funnel (P1). Rulings: Screen Inventory §3.11.
 *
 * Inquiry → Proposal → Booked → Traveled, over the trips that CAME IN during the period. No
 * Lead or Qualified stage: a quote request is a trip (decided 2026-09-09). Each stage's drop is
 * split into still open (not a loss yet) and cancelled. Average days to book, the hub's old
 * "Time-to-book" tile, sits under the funnel.
 *
 * The subtitle IS the summary ("142 inquiries → 32 traveled · 22.5% made it all the way"), as the
 * artboard draws it.
 */

export const metadata = { title: "Conversion funnel" };

export default async function FunnelReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const period = readPeriod((await searchParams).period);
  const data = await loadFunnelReport(period);

  const shell = {
    title: REPORTS_COPY.funnelTitle,
    subtitle: data?.report.summary ?? "",
    chips: periodChips("funnel", period),
    exportHref: reportExportHref("funnel", period),
    windowLabel: data?.window.rangeLabel ?? null,
  };

  if (!data) {
    return (
      <ReportShell {...shell}>
        <RetryState />
      </ReportShell>
    );
  }

  return (
    <ReportShell {...shell}>
      {data.report.empty ? (
        <Card>
          <CardContent>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {REPORTS_COPY.funnelEmpty}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <FunnelChart report={data.report} />
      )}
      <ReportNote>{REPORTS_COPY.funnelNote}</ReportNote>
      <ReportNote>{REPORTS_COPY.funnelTracking}</ReportNote>
    </ReportShell>
  );
}
