import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { DestinationTable } from "@/components/agent/reports/RankedTables";
import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { loadDestinationReport } from "@/lib/agent/reports";
import { periodChips, readPeriod, reportExportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * Screen 3.11.4 — Top Destinations (P1). Rulings: Screen Inventory §3.11.
 *
 * NO MAP. The artboard's pins sit on a stock photograph at made-up spots; a real map needs a
 * tile provider, a new third-party service and a security review. A ranked table with a bar
 * per row says the same thing truthfully.
 *
 * A trip with several stops counts once in each, its value split evenly so the column adds up
 * to the trips' total; the footnote says so.
 */

export const metadata = { title: "Top destinations" };

export default async function DestinationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const period = readPeriod((await searchParams).period);
  const data = await loadDestinationReport(period);

  const shell = {
    title: REPORTS_COPY.destinationsTitle,
    subtitle: REPORTS_COPY.destinationsSubtitle,
    chips: periodChips("destinations", period),
    exportHref: reportExportHref("destinations", period),
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
              {REPORTS_COPY.destinationsEmpty}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <DestinationTable report={data.report} />
      )}
      <ReportNote>{REPORTS_COPY.destinationsNote}</ReportNote>
    </ReportShell>
  );
}
