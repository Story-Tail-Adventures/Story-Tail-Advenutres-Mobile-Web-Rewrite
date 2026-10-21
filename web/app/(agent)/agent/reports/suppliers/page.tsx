import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { SupplierTable } from "@/components/agent/reports/RankedTables";
import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { loadSupplierReport } from "@/lib/agent/reports";
import { periodChips, readPeriod, reportExportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY, suppliersSetAside } from "@/lib/agent/reportsCopy";

/**
 * Screen 3.11.3 — Commission by Supplier (P1). Rulings: Screen Inventory §3.11.
 *
 * THE STORED LEDGER, NEVER THE FORECAST. The period filters on travel dates, exactly as the
 * ledger screen does, so a supplier's name opens the ledger filtered to the very lines its
 * row summed. Disputed and lost lines are in neither column; the footnote counts them.
 */

export const metadata = { title: "Commission by supplier" };

export default async function SupplierReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const period = readPeriod((await searchParams).period);
  const data = await loadSupplierReport(period);

  const shell = {
    title: REPORTS_COPY.suppliersTitle,
    subtitle: REPORTS_COPY.suppliersSubtitle,
    chips: periodChips("suppliers", period),
    exportHref: reportExportHref("suppliers", period),
    windowLabel: data?.window.rangeLabel ?? null,
  };

  if (!data) {
    return (
      <ReportShell {...shell}>
        <RetryState />
      </ReportShell>
    );
  }

  const setAside = suppliersSetAside(data.report.setAsideCount, data.report.setAsideReceivedLabel);

  return (
    <ReportShell {...shell}>
      {data.report.empty ? (
        <Card>
          <CardContent>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {REPORTS_COPY.suppliersEmpty}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <SupplierTable report={data.report} />
      )}
      <ReportNote>{REPORTS_COPY.suppliersNote}</ReportNote>
      {setAside && <ReportNote>{setAside}</ReportNote>}
    </ReportShell>
  );
}
