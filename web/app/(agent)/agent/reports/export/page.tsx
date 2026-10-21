import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { ExportCenterForm } from "@/components/agent/reports/ExportCenterForm";
import { ReportNote, ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { Icon } from "@/components/ui/Icon";
import { loadExportCenter } from "@/lib/agent/reports";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";
import { TAP_TARGET } from "@/lib/mui/sx";

/**
 * Screen 3.11.8 — Export Center (P1). Rulings: Screen Inventory §3.11, "Ruled 2026-10-21".
 *
 * CSV ONLY, ON DEMAND, NOTHING STORED. A download is built when asked for and handed straight
 * to the browser, so no client data sits in a bucket and nothing expires. The artboard's
 * "expired · Re-generate" becomes "Run again" on every line.
 *
 * RECENT EXPORTS ARE THE AUDIT ROWS every export already writes: this page's, each report's
 * own Export, and the ledger's. No history table to keep in step with them.
 *
 * Web only (§3.11). Run again is a plain anchor (never next/link): the route writes an audit
 * row, and a hover prefetch would be an export nobody asked for.
 */

export const metadata = { title: "Export center" };

export default async function ExportCenterPage() {
  const data = await loadExportCenter();

  const shell = {
    title: REPORTS_COPY.exportTitle,
    subtitle: REPORTS_COPY.exportSubtitle,
    chips: [],
    exportHref: null,
    windowLabel: null,
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
      <Box sx={GRID_SX}>
        <ExportCenterForm today={data.today} />

        <Card sx={{ height: "100%" }}>
          <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
            <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
              {REPORTS_COPY.recentTitle}
            </Typography>
            {data.history.length === 0 ? (
              <Typography component="p" variant="body2" sx={{ mt: 1.25, color: "text.secondary" }}>
                {REPORTS_COPY.recentEmpty}
              </Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: "none" }}>
                {data.history.map((h) => (
                  <Box component="li" key={h.id} sx={ROW_SX}>
                    <Box aria-hidden="true" sx={BADGE_SX}>CSV</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography component="p" variant="subtitle2" sx={{ m: 0 }}>
                        {h.title}
                      </Typography>
                      <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                        {h.detail}
                      </Typography>
                    </Box>
                    {h.runAgainHref && (
                      <MuiButton
                        component="a"
                        href={h.runAgainHref}
                        variant="outlined"
                        color="secondary"
                        size="small"
                        aria-label={`${REPORTS_COPY.runAgain}: ${h.title}${h.detail ? `, ${h.detail}` : ""}`}
                        sx={{ flexShrink: 0, gap: 0.5, ...TAP_TARGET }}
                      >
                        <Icon name="download" size={12} />
                        {REPORTS_COPY.runAgain}
                      </MuiButton>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
      <ReportNote>{REPORTS_COPY.recentNote}</ReportNote>
    </ReportShell>
  );
}

/** Side by side from `lg`, as the artboard; stacked below it. */
const GRID_SX = {
  display: "grid",
  gap: 1.75,
  alignItems: "start",
  maxWidth: 1080,
  gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
} as const;

const ROW_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  py: 1,
  borderTop: 1,
  borderColor: "divider",
} as const;

/** The artboard's little file tag. */
const BADGE_SX = {
  width: 28,
  height: 34,
  flexShrink: 0,
  borderRadius: 0.5,
  bgcolor: "primary.main",
  color: "primary.contrastText",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 8,
  lineHeight: 1,
} as const;
