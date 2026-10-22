import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiButton from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { STATEMENT_COPY, statementRowName } from "@/lib/agent/content";
import type { StatementRowView } from "@/lib/agent/statements";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.7.6's table, as A376_Reconciliation draws it: Inteletravel row (mono) | ledger match,
 * with the warning line under it | confidence chip | amount (mono, bold) | Auto ✓ or Resolve.
 *
 * Rows that need the advisor come first (the loader sorts them); each one's Resolve is a link
 * to its own page rather than a dialog, so the choice between four kinds of decision has room
 * and a URL. A row already decided keeps a quiet "Change" beside its outcome while the
 * statement is open.
 *
 * One structure, for the reason the ledger table gives: §3.7 has no phone artboards, and
 * Screen Inventory §4.4 makes reconciliation web-primary. Narrow screens scroll it sideways.
 */
export function StatementRowsTable({ rows, open }: { rows: StatementRowView[]; open: boolean }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={STATEMENT_COPY.rowsTableLabel} sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{STATEMENT_COPY.colStatementRow}</TableCell>
            <TableCell scope="col">{STATEMENT_COPY.colMatch}</TableCell>
            <TableCell scope="col">{STATEMENT_COPY.colConfidence}</TableCell>
            <TableCell scope="col" align="right">{STATEMENT_COPY.colAmount}</TableCell>
            <TableCell scope="col">
              <Box component="span" sx={VISUALLY_HIDDEN}>{STATEMENT_COPY.colAction}</Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.rowId} id={`row-${r.rowNumber}`}>
              <TableCell component="th" scope="row" sx={{ minWidth: 200, maxWidth: 320 }}>
                <Box component="span" sx={VISUALLY_HIDDEN}>{`${statementRowName(r.rowNumber)}: `}</Box>
                <Typography
                  component="span"
                  sx={{ display: "block", fontFamily: "mono", fontWeight: 500, fontSize: 12, overflowWrap: "anywhere" }}
                >
                  {r.statementLine}
                </Typography>
                {r.paidOnLabel && (
                  <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {r.paidOnLabel}
                  </Typography>
                )}
              </TableCell>
              <TableCell sx={{ minWidth: 220 }}>
                {r.matchHref ? (
                  <MuiLink component={NextLink} href={r.matchHref} underline="hover" color="inherit" variant="caption" sx={{ display: "block" }}>
                    {r.matchLabel}
                  </MuiLink>
                ) : (
                  <Typography component="span" variant="caption" sx={{ display: "block" }}>{r.matchLabel}</Typography>
                )}
                {r.note && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ display: "block", color: r.needsYou || r.state === "confirmed" ? "warning.main" : "text.secondary" }}
                  >
                    {r.note}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {r.confidenceLabel && <StatusChip kind={r.confidenceChip} label={r.confidenceLabel} />}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: "mono", fontWeight: 700, whiteSpace: "nowrap" }}>
                {r.amountLabel ?? "—"}
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {r.needsYou && open ? (
                  <MuiButton
                    component={NextLink}
                    href={r.resolveHref}
                    variant="outlined"
                    color="secondary"
                    size="small"
                    aria-label={`${STATEMENT_COPY.resolve} ${statementRowName(r.rowNumber).toLowerCase()}`}
                  >
                    {STATEMENT_COPY.resolve}
                  </MuiButton>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {r.doneLabel && <StatusChip kind={r.state === "ignored" ? "past" : "booked"} label={r.doneLabel} />}
                    {open && r.state !== "already_recorded" && (
                      <MuiLink
                        component={NextLink}
                        href={r.resolveHref}
                        underline="hover"
                        variant="caption"
                        aria-label={`${STATEMENT_COPY.change} ${statementRowName(r.rowNumber).toLowerCase()}`}
                      >
                        {STATEMENT_COPY.change}
                      </MuiLink>
                    )}
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
