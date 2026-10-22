import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import type { ClientLine, FunnelReport } from "@/lib/agent/reportsView";
import { funnelTrips, REPORTS_COPY } from "@/lib/agent/reportsCopy";

/**
 * 3.11.5's table and 3.11.6's funnel, as A3115_LTV and A3116_Funnel draw them.
 *
 * Lifetime value IS a table (the artboard draws no chart). Each client's name opens Client
 * Detail, where the same figure is shown; rank is over the whole book, so a cohort filter keeps
 * each client's true rank.
 *
 * The funnel's bars are `aria-hidden`; the table under them carries every figure (§3.11).
 */

export function ClientTable({ rows }: { rows: ClientLine[] }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={REPORTS_COPY.clientsTableCaption} sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col" sx={{ width: 56 }}>{REPORTS_COPY.colRank}</TableCell>
            <TableCell scope="col">{REPORTS_COPY.colClient}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colTrips}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colLifetime}</TableCell>
            <TableCell scope="col" align="right">{REPORTS_COPY.colCommission}</TableCell>
            <TableCell scope="col">{REPORTS_COPY.colCohort}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.clientId}>
              <TableCell sx={{ ...MONO, fontWeight: 700 }}>{r.rank}</TableCell>
              <TableCell component="th" scope="row" sx={{ minWidth: 180 }}>
                <MuiLink component={NextLink} href={r.href} underline="hover" sx={{ fontWeight: 600 }}>
                  {r.name}
                </MuiLink>
              </TableCell>
              <TableCell align="right" sx={MONO}>{r.tripsLabel}</TableCell>
              <TableCell align="right" sx={{ ...MONO, fontWeight: 700 }}>{r.valueLabel}</TableCell>
              <TableCell align="right" sx={{ ...MONO, color: "primary.main" }}>{r.commissionLabel}</TableCell>
              <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>{r.cohortLabel}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** Inquiry on the primary container, the middle stages on secondary, Traveled on success. */
function tone(i: number, last: number) {
  if (i === 0) return { bgcolor: "primary.container", color: "primary.onContainer" };
  if (i === last) return { bgcolor: "success.container", color: "text.primary" };
  return { bgcolor: "secondary.container", color: "secondary.onContainer" };
}

export function FunnelChart({ report }: { report: FunnelReport }) {
  const last = report.stages.length - 1;
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 3.5 }, "&:last-child": { pb: { xs: 2, md: 3.5 } } }}>
        <Box aria-hidden="true">
          {report.stages.map((s, i) => (
            <Box key={s.stage} sx={ROW_SX}>
              <Typography component="span" variant="subtitle1" sx={{ flex: { xs: "0 0 76px", sm: "0 0 110px" } }}>
                {s.label}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    // As wide as its share, and never narrower than its own label: a short bar
                    // grows to fit "32 trips  22.5%" rather than spilling it past its edge.
                    width: `${s.pctOfTop}%`,
                    minWidth: "max-content",
                    maxWidth: "100%",
                    height: 38,
                    borderRadius: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 1.75,
                    ...(s.reached > 0 ? tone(i, last) : { bgcolor: "surface.2", color: "text.secondary" }),
                  }}
                >
                  <Typography component="span" variant="subtitle1" sx={{ color: "inherit", whiteSpace: "nowrap" }}>
                    {funnelTrips(s.reached)}
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ opacity: 0.85, fontWeight: 600, color: "inherit" }}>
                    {s.pctLabel}
                  </Typography>
                </Box>
              </Box>
              <Typography
                component="span"
                variant="caption"
                sx={{ display: { xs: "none", sm: "block" }, flex: "0 0 190px", textAlign: "right", color: "text.secondary" }}
              >
                {s.stoppedLabel}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: "divider" }}>
          <Typography component="p" variant="body2" sx={{ fontWeight: 600 }}>
            {report.bookDaysLabel}
          </Typography>
        </Box>

        {/* Focusable, so a keyboard can scroll it when a phone is narrower than the table. */}
        <Box role="region" aria-label={REPORTS_COPY.funnelTableCaption} tabIndex={0} sx={{ mt: 2, overflowX: "auto" }}>
          <Table size="small" aria-label={REPORTS_COPY.funnelTableCaption} sx={{ width: "100%" }}>
            <TableHead>
              <TableRow>
                <TableCell scope="col">{REPORTS_COPY.colStage}</TableCell>
                <TableCell scope="col" align="right">{REPORTS_COPY.colReached}</TableCell>
                <TableCell scope="col" align="right">{REPORTS_COPY.colPctOfInquiries}</TableCell>
                <TableCell scope="col" align="right">{REPORTS_COPY.colStillOpen}</TableCell>
                <TableCell scope="col" align="right">{REPORTS_COPY.colCancelled}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.stages.map((s, i) => (
                <TableRow key={s.stage}>
                  <TableCell component="th" scope="row">{s.label}</TableCell>
                  <TableCell align="right" sx={MONO}>{s.reachedLabel}</TableCell>
                  <TableCell align="right" sx={{ ...MONO, color: "text.secondary" }}>{s.pctLabel}</TableCell>
                  {/* The last stage is the end of the road: nobody "stops" at Traveled. */}
                  <TableCell align="right" sx={MONO}>{i < last ? s.openHere : "—"}</TableCell>
                  <TableCell align="right" sx={MONO}>{i < last ? s.cancelledHere : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
}

const MONO = { fontFamily: "mono", whiteSpace: "nowrap" } as const;

const ROW_SX = { display: "flex", alignItems: "center", gap: 1.5, py: 1.25 } as const;
