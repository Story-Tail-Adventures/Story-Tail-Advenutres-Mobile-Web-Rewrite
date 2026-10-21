import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import { ForecastStagesCard } from "@/components/agent/ForecastStagesCard";
import { PipelineMonths } from "@/components/agent/reports/PipelineMonths";
import { ReportShell } from "@/components/agent/reports/ReportShell";
import { RetryState } from "@/components/client/RetryState";
import { loadPipelineReport } from "@/lib/agent/reports";
import { reportExportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * Screen 3.11.7 — Pipeline Value (P1), as A3117_PipelineValue draws it (drawn locally
 * 2026-10-21; Gyasi approved its three calls the same day).
 *
 * TODAY, SO NO PERIOD CHIPS. A pipeline is what is open now.
 *
 * ONE SET OF WEIGHTS. "Adjust weights" is §3.7.7's own card, editing the same pipeline_weight
 * rows in place, over GROSS value here (commission there). Saving refreshes this page, the
 * commission forecast and the worklist, and comes back here.
 *
 * Two tiles (open at full value, and weighted), then by stage, then by travel month.
 */

export const metadata = { title: "Pipeline value" };

export default async function PipelineReportPage() {
  const data = await loadPipelineReport();

  const shell = {
    title: REPORTS_COPY.pipelineTitle,
    subtitle: REPORTS_COPY.pipelineSubtitle,
    chips: [],
    exportHref: reportExportHref("pipeline", null),
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

  return (
    <ReportShell {...shell}>
      {report.empty && (
        <Typography component="p" variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
          {REPORTS_COPY.pipelineEmpty}
        </Typography>
      )}

      <Box sx={TILES_SX}>
        <Tile label={REPORTS_COPY.tileOpen} value={report.grossLabel} sub={report.openSub} />
        <Tile label={REPORTS_COPY.tileWeighted} value={report.weightedLabel} sub={REPORTS_COPY.tileWeightedSub} accent />
      </Box>

      <Box sx={CARDS_SX}>
        <ForecastStagesCard
          title={REPORTS_COPY.byStage}
          totalLabel={report.weightedLabel}
          acrossLabel={REPORTS_COPY.weightsShared}
          stages={report.stages}
          currency="USD"
          hint={REPORTS_COPY.weightsHint}
          showTotal={false}
          returnTo="pipeline"
        />
        <PipelineMonths months={report.months} />
      </Box>
    </ReportShell>
  );
}

function Tile({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography component="h2" variant="overline" sx={{ m: 0, display: "block", lineHeight: 1.3, color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography
          component="p"
          variant="h4"
          sx={{ m: 0, fontFamily: "mono", fontWeight: 700, color: accent ? "primary.main" : "text.primary" }}
        >
          {value}
        </Typography>
        <Typography component="p" variant="caption" sx={{ color: "text.secondary" }}>
          {sub}
        </Typography>
      </CardContent>
    </Card>
  );
}

/** Two across from `sm`, as the artboard; stacked on a phone. */
const TILES_SX = {
  display: "grid",
  gap: 1.5,
  mb: 1.75,
  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
} as const;

/** Side by side from `lg`: below it the stage rows' bars get too narrow (§3.7.7's finding). */
const CARDS_SX = {
  display: "grid",
  gap: 1.75,
  alignItems: "start",
  gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
} as const;
