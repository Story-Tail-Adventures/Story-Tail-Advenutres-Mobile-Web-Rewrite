import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableFooter from "@mui/material/TableFooter";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import type { DestinationReport, SupplierReport } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * 3.11.3 and 3.11.4: ranked lists where THE TABLE IS THE CHART. Each row carries its own bar
 * under the name, so the figures and the picture are one thing a screen reader reads in order,
 * rather than a drawing plus a second copy of the same names (§3.11: a table under every chart).
 *
 * The bars are `aria-hidden`: the cells beside them already say the number.
 */

export function SupplierTable({ report }: { report: SupplierReport }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={REPORTS_COPY.suppliersTableCaption} sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{REPORTS_COPY.colSupplier}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colReceived}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colOwed}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colShare}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {report.rows.map((r) => (
            <TableRow key={r.supplierId}>
              <TableCell component="th" scope="row" sx={{ minWidth: 200 }}>
                <MuiLink component={NextLink} href={r.href} underline="hover" sx={{ fontWeight: 600 }}>
                  {r.name}
                </MuiLink>
                {/* Received (solid) and still owed (pale) in one bar, as wide as the share. */}
                <Box aria-hidden="true" sx={TRACK_SX}>
                  <Box sx={{ display: "flex", height: "100%", width: `${r.sharePct}%` }}>
                    <Box sx={{ width: `${r.receivedPct}%`, bgcolor: "primary.main" }} />
                    <Box sx={{ flex: 1, bgcolor: "primary.container" }} />
                  </Box>
                </Box>
              </TableCell>
              <TableCell align="right" sx={MONO}>{r.receivedLabel}</TableCell>
              <TableCell align="right" sx={MONO}>{r.owedLabel}</TableCell>
              <TableCell align="right" sx={{ ...MONO, color: "text.secondary" }}>{r.shareLabel}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell component="th" scope="row" sx={FOOT_SX}>{REPORTS_COPY.total}</TableCell>
            <TableCell align="right" sx={{ ...MONO, ...FOOT_SX }}>{report.receivedTotalLabel}</TableCell>
            <TableCell align="right" sx={{ ...MONO, ...FOOT_SX }}>{report.owedTotalLabel}</TableCell>
            <TableCell sx={FOOT_SX} />
          </TableRow>
        </TableFooter>
      </Table>
      <Box aria-hidden="true" sx={{ display: "flex", gap: 2, px: 2, py: 1.25, color: "text.secondary" }}>
        <Swatch color="primary.main" label={REPORTS_COPY.colReceived} />
        <Swatch color="primary.container" label={REPORTS_COPY.colOwed} />
      </Box>
    </Card>
  );
}

export function DestinationTable({ report }: { report: DestinationReport }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={REPORTS_COPY.destinationsTableCaption} sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{REPORTS_COPY.colDestination}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colTrips}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colValue}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {report.rows.map((r) => (
            <TableRow key={r.unnamed ? "∅" : r.name}>
              <TableCell
                component="th"
                scope="row"
                sx={{ minWidth: 200, fontWeight: 600, ...(r.unnamed ? { fontStyle: "italic", color: "text.secondary" } : {}) }}
              >
                {r.name}
                <Box aria-hidden="true" sx={TRACK_SX}>
                  <Box sx={{ height: "100%", width: `${r.sharePct}%`, bgcolor: r.unnamed ? "outline.main" : "tertiary.main" }} />
                </Box>
              </TableCell>
              <TableCell align="right" sx={MONO}>{r.tripsLabel}</TableCell>
              <TableCell align="right" sx={MONO}>{r.valueLabel}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell component="th" scope="row" sx={FOOT_SX}>{REPORTS_COPY.total}</TableCell>
            <TableCell sx={FOOT_SX} />
            <TableCell align="right" sx={{ ...MONO, ...FOOT_SX }}>{report.totalLabel}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: color }} />
      <Typography component="span" variant="caption">{label}</Typography>
    </Box>
  );
}

const MONO = { fontFamily: "mono", whiteSpace: "nowrap" } as const;

const FOOT_SX = { fontWeight: 700, color: "text.primary", fontSize: "0.875rem", borderBottom: 0 } as const;

/** The artboard's 6px rounded track on `surface.3`. */
const TRACK_SX = {
  mt: 0.75,
  height: 6,
  borderRadius: 3,
  overflow: "hidden",
  bgcolor: "surface.3",
} as const;
