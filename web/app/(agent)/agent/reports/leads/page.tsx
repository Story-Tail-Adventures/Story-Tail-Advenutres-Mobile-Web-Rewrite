import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { loadLeadSourcesReport } from "@/lib/agent/reports";
import { LEAD_SOURCES_COPY, leadSourcesSummary } from "@/lib/agent/reportsCopy";
import { periodChips, readPeriod } from "@/lib/agent/reportsView";

/**
 * Screen 3.11.9 Lead Sources (P2). Rulings: BRD §6.5 and Screen Inventory 3.11.9
 * (2026-10-21); it was 3.8.5 until Leads was revived in a smaller shape.
 *
 * Leads created in the period, one bar per source split into became a client / still open /
 * closed, with the same figures in a plain table under it (§3.11's shared rule: every chart has
 * its table, which is also what a screen reader reads). Website campaigns (`utm_source`) below
 * when there are any. No time-to-first-contact (ruled out), and not in the Export Center.
 *
 * Drawn by hand with boxes, like the other §3.11 charts: no chart library.
 */

export const metadata = { title: "Lead sources" };

const SEGMENTS = [
  { key: "clientsPct", color: "success.main" },
  { key: "openPct", color: "primary.main" },
  { key: "closedPct", color: "outline.main" },
] as const;

const LEGEND = [
  { label: LEAD_SOURCES_COPY.colClients, color: "success.main" },
  { label: LEAD_SOURCES_COPY.colOpen, color: "primary.main" },
  { label: LEAD_SOURCES_COPY.colClosed, color: "outline.main" },
] as const;

export default async function LeadSourcesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const period = readPeriod((await searchParams).period);
  const data = await loadLeadSourcesReport(period);

  const shell = {
    title: LEAD_SOURCES_COPY.title,
    subtitle: data ? leadSourcesSummary(data.report.total, data.report.clients) : "",
    chips: periodChips("leads", period),
    exportHref: null,
    windowLabel: data?.window.rangeLabel ?? null,
  };

  if (!data) {
    return (
      <ReportShell {...shell}>
        <RetryState />
      </ReportShell>
    );
  }

  const { report } = data;

  return (
    <ReportShell {...shell}>
      {report.empty ? (
        <Card>
          <CardContent>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {LEAD_SOURCES_COPY.empty}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
              {LEAD_SOURCES_COPY.chartLabel}
            </Typography>

            {/* The bars are decoration for sighted readers; the table below carries the figures. */}
            <Box aria-hidden="true" sx={{ display: "grid", gap: 1 }}>
              {report.lines.map((l) => (
                <Box key={l.source} sx={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr) 40px", gap: 1, alignItems: "center" }}>
                  <Typography variant="body2">{l.label}</Typography>
                  <Box sx={{ display: "flex", height: 14, bgcolor: "surface.2", borderRadius: 0.5, overflow: "hidden" }}>
                    {SEGMENTS.map((s) => (
                      <Box key={s.key} sx={{ width: `${l[s.key]}%`, bgcolor: s.color }} />
                    ))}
                  </Box>
                  <Typography variant="body2" sx={{ textAlign: "right" }}>
                    {l.leads}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box aria-hidden="true" sx={{ mt: 1.5, display: "flex", flexWrap: "wrap", gap: 2 }}>
              {LEGEND.map((g) => (
                <Box key={g.label} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: g.color }} />
                  <Typography variant="caption">{g.label}</Typography>
                </Box>
              ))}
            </Box>

            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{LEAD_SOURCES_COPY.colSource}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colLeads}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colClients}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colOpen}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colClosed}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.lines.map((l) => (
                  <TableRow key={l.source}>
                    <TableCell>{l.label}</TableCell>
                    <TableCell align="right">{l.leads}</TableCell>
                    <TableCell align="right">{l.clients}</TableCell>
                    <TableCell align="right">{l.open}</TableCell>
                    <TableCell align="right">{l.closed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report.campaigns.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              {LEAD_SOURCES_COPY.campaignsTitle}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{LEAD_SOURCES_COPY.colCampaign}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colLeads}</TableCell>
                  <TableCell align="right">{LEAD_SOURCES_COPY.colClients}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.campaigns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>{c.name}</TableCell>
                    <TableCell align="right">{c.leads}</TableCell>
                    <TableCell align="right">{c.clients}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ReportNote>{LEAD_SOURCES_COPY.note}</ReportNote>
    </ReportShell>
  );
}
