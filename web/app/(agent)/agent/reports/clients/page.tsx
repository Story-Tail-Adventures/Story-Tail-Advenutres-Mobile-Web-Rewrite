import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { ClientTable } from "@/components/agent/reports/ClientsAndFunnel";
import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { loadClientReport } from "@/lib/agent/reports";
import { readCohort, reportExportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.11.5 — Client Lifetime Value (P1). Rulings: Screen Inventory §3.11.
 *
 * LIFETIME, SO NO PERIOD CHIPS. The figure is Client Detail's own (every committed trip, ever);
 * a period would make it something else. The filter is COHORT instead: the quarter of a
 * client's first booking, as links, so a filtered view is a URL. No cohort grid.
 *
 * The Export downloads the whole ranking, whatever cohort is on screen.
 */

export const metadata = { title: "Client lifetime value" };

export default async function ClientValueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cohort?: string | string[] }>;
}) {
  const cohort = readCohort((await searchParams).cohort);
  const data = await loadClientReport(cohort);

  const shell = {
    title: REPORTS_COPY.clientsTitle,
    subtitle: REPORTS_COPY.clientsSubtitle,
    chips: [],
    exportHref: reportExportHref("clients", null),
    windowLabel: null,
  };

  if (!data) {
    return (
      <ReportShell {...shell}>
        <RetryState />
      </ReportShell>
    );
  }

  const { report } = data;
  const controls = report.empty ? null : (
    <Box component="nav" aria-label={REPORTS_COPY.cohortLabel} sx={{ mb: 1.75, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {report.cohorts.map((c) => (
        <Chip
          key={c.key ?? "all"}
          component={NextLink}
          href={c.href}
          scroll={false}
          clickable
          label={c.label}
          color={c.selected ? "primary" : "default"}
          variant={c.selected ? "filled" : "outlined"}
          aria-current={c.selected ? "true" : undefined}
          sx={TAP_TARGET}
        />
      ))}
    </Box>
  );

  return (
    <ReportShell {...shell} controls={controls}>
      {report.rows.length === 0 ? (
        <Card>
          <CardContent>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {report.empty ? REPORTS_COPY.clientsEmpty : REPORTS_COPY.clientsCohortEmpty}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <ClientTable rows={report.rows} />
      )}
      <ReportNote>{REPORTS_COPY.clientsNote}</ReportNote>
      <ReportNote>{REPORTS_COPY.clientsTracking}</ReportNote>
    </ReportShell>
  );
}
