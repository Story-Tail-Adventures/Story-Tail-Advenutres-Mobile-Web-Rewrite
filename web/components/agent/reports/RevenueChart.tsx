import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { RevenueBasis, RevenueReport } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * 3.11.2's chart and table, as A3112_Revenue draws it: the period's total top left, the "vs
 * last year" chip top right, one flat-topped bar per month on `primary.main`, the current
 * month on `brand.main`.
 *
 * BOXES, NOT A CHART LIBRARY (§3.11 ruling), the same construction as CommissionTrendChart.
 * The bars are `aria-hidden`; the TABLE under them carries every figure and is visible, not
 * screen-reader only: §3.11 puts a plain table under every chart, and it is also what the
 * Export downloads.
 *
 * LAST YEAR appears only when `compare` is on AND some month has a figure a year back. The
 * page hides the toggle until then (§3.11: a comparison against no data is a broken number).
 * Last year's bar stands beside this year's on the same scale, in `outline.variant`.
 */
export function RevenueChart({
  report,
  basis,
  compare,
  totalCaption,
}: {
  report: RevenueReport;
  basis: RevenueBasis;
  compare: boolean;
  totalCaption: string;
}) {
  const showPrior = compare && report.hasPrior;
  const booked = basis === "booked";

  return (
    <Card>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 1, mb: 1.5 }}>
          <Box>
            <Typography component="p" variant="h4" sx={{ m: 0, fontFamily: "mono", fontWeight: 700 }}>
              {report.totalLabel}
            </Typography>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {totalCaption}
            </Typography>
          </Box>
          {report.change && (
            // Outlined and neutral, as §3.7.1's chip: the artboard's green would be wrong the
            // first year the figure goes down.
            <Chip variant="outlined" label={report.change} sx={{ ml: "auto", fontWeight: 600 }} />
          )}
        </Box>

        {report.empty && (
          <Typography component="p" variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
            {booked ? REPORTS_COPY.revenueEmptyBooked : REPORTS_COPY.revenueEmptyReceived}
          </Typography>
        )}

        {showPrior && (
          <Box aria-hidden="true" sx={{ display: "flex", gap: 2, mb: 1, color: "text.secondary" }}>
            <Legend swatch="primary.main" label={REPORTS_COPY.thisYear} />
            <Legend swatch="outline.variant" label={REPORTS_COPY.lastYear} />
          </Box>
        )}

        <Box aria-hidden="true" sx={BARS_SX}>
          {report.months.map((m) => (
            <Box
              key={m.monthStart}
              title={showPrior && m.priorLabel ? `${m.longLabel}: ${m.amountLabel} (last year ${m.priorLabel})` : `${m.longLabel}: ${m.amountLabel}`}
              sx={COLUMN_SX}
            >
              <Box sx={BAR_AREA_SX}>
                {showPrior && (
                  <Box sx={{ ...BAR_SX, width: "34%", height: `${m.priorHeightPct}%`, bgcolor: "outline.variant" }} />
                )}
                <Box
                  sx={{
                    ...BAR_SX,
                    width: showPrior ? "34%" : "60%",
                    height: `${m.heightPct}%`,
                    bgcolor: m.isCurrent ? "brand.main" : "primary.main",
                  }}
                />
              </Box>
              <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                {m.label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 2.5, overflowX: "auto" }}>
          <Table size="small" aria-label={REPORTS_COPY.revenueTableCaption} sx={{ width: "100%" }}>
            <TableHead>
              <TableRow>
                <TableCell scope="col">{REPORTS_COPY.colMonth}</TableCell>
                <TableCell scope="col" align="right">{booked ? REPORTS_COPY.colBooked : REPORTS_COPY.colReceived}</TableCell>
                <TableCell scope="col" align="right">{booked ? REPORTS_COPY.colTrips : REPORTS_COPY.colPayments}</TableCell>
                {report.hasPrior && <TableCell scope="col" align="right">{REPORTS_COPY.colLastYear}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Newest first in the table: the month the advisor is in is the one they look for. */}
              {[...report.months].reverse().map((m) => (
                <TableRow key={m.monthStart}>
                  <TableCell component="th" scope="row">{m.longLabel}</TableCell>
                  <TableCell align="right" sx={MONO}>{m.amountLabel}</TableCell>
                  <TableCell align="right" sx={MONO}>{m.countLabel}</TableCell>
                  {report.hasPrior && (
                    <TableCell align="right" sx={{ ...MONO, color: "text.secondary" }}>
                      {m.priorLabel ?? REPORTS_COPY.noPrior}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: swatch }} />
      <Typography component="span" variant="caption">{label}</Typography>
    </Box>
  );
}

const MONO = { fontFamily: "mono", whiteSpace: "nowrap" } as const;

/** The artboard's 220px plot, bars standing on the baseline. */
const BARS_SX = { height: 220, display: "flex", alignItems: "flex-end", gap: { xs: 0.5, sm: 1.5 } } as const;

const COLUMN_SX = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 0.5,
} as const;

/** The bar's height resolves against this box, so the tallest bar plus its label fits. */
const BAR_AREA_SX = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: "2px",
} as const;

const BAR_SX = { borderRadius: "4px 4px 0 0" } as const;
