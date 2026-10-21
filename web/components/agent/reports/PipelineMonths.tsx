import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { PipelineMonth } from "@/lib/agent/reportsView";
import { REPORTS_COPY } from "@/lib/agent/reportsCopy";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * A3117's right card: the weighted pipeline by the month each trip starts, this month and the
 * eleven after, with "Start date passed", "Later" and "No travel dates yet" set apart so nothing
 * open is dropped.
 *
 * THE ROWS ARE A TABLE (month, bar, amount), so it reads in order to a screen reader; the bar
 * cell is `aria-hidden`, since the amount beside it already says the number (§3.11).
 */
export function PipelineMonths({ months }: { months: PipelineMonth[] }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
          {REPORTS_COPY.byMonth}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
          {REPORTS_COPY.byMonthSub} {REPORTS_COPY.monthNow}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ position: "relative" }}>
        <Table size="small" aria-label={REPORTS_COPY.byMonthTableCaption} sx={{ width: "100%", tableLayout: "fixed" }}>
          {/* `tableLayout: fixed` takes its widths from here, not from the first row, which can be
              a spanning "Start date passed" row. */}
          <colgroup>
            <col style={{ width: 88 }} />
            <col />
            <col style={{ width: 96 }} />
          </colgroup>
          {/* Read aloud, not drawn: the card's own title already says what the columns are. */}
          <TableHead sx={VISUALLY_HIDDEN}>
            <TableRow>
              <TableCell scope="col">{REPORTS_COPY.colMonth2}</TableCell>
              <TableCell scope="col" />
              <TableCell scope="col">{REPORTS_COPY.colWeightedValue}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {months.map((m) => (
              <TableRow key={m.key} sx={m.extra ? EXTRA_ROW_SX : undefined}>
                <TableCell
                  component="th"
                  scope="row"
                  sx={{
                    ...CELL_SX,
                    fontWeight: 600,
                    // The set-apart rows wrap rather than run under the amount at 375px.
                    ...(m.extra ? { fontStyle: "italic", color: "text.secondary" } : { whiteSpace: "nowrap" }),
                  }}
                  colSpan={m.extra ? 2 : 1}
                >
                  {m.label}
                </TableCell>
                {!m.extra && (
                  <TableCell aria-hidden="true" sx={CELL_SX}>
                    <Box sx={TRACK_SX}>
                      <Box sx={{ height: "100%", width: `${m.barPct}%`, bgcolor: "primary.main" }} />
                    </Box>
                  </TableCell>
                )}
                <TableCell align="right" sx={{ ...CELL_SX, fontFamily: "mono", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {m.amountLabel}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </Box>
      </CardContent>
    </Card>
  );
}

const CELL_SX = { borderBottom: 0, py: 0.5, px: 0.75 } as const;

/** The first set-apart row gets the artboard's rule above it. */
const EXTRA_ROW_SX = { "& > *": { borderTop: 1, borderColor: "divider" } } as const;

/** The artboard's 8px rounded track. */
const TRACK_SX = { height: 8, borderRadius: 4, overflow: "hidden", bgcolor: "surface.3" } as const;
