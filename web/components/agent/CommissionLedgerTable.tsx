import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { COMMISSION_COPY } from "@/lib/agent/content";
import type { LedgerRow } from "@/lib/agent/commission";

/**
 * §3.7.2's rows — §4.4 Pattern B, web half, as A372_CommissionList draws it: a `size="small"`
 * Table in a Card, the trip at 500, meta in text.secondary, money in the mono face, the
 * commission column bold on primary.
 *
 * ONE STRUCTURE, for the reason TripRosterTable gives: Commission is not on the phone bar and
 * §3.7 has no phone artboards, so a card-list twin would be markup nobody can reach.
 *
 * NO ROW HOVER. The artboard draws `hover`, which tells a pointer the row goes somewhere; in
 * Stage 1 only the trip title does (§3.7.3's line detail is Stage 2). The page footer says
 * so in a sentence.
 *
 * "Comm" is the EXPECTED commission — Screen Inventory §3.7.2's column list says "expected",
 * and it is the figure the artboard prints (gross × rate). What actually arrived, and the
 * fee, belong to §3.7.3's detail and §3.7.6's reconciliation.
 */

const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function CommissionLedgerTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={COMMISSION_COPY.ledgerTableLabel} sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            <TableCell scope="col">{COMMISSION_COPY.colTrip}</TableCell>
            <TableCell scope="col">{COMMISSION_COPY.colSupplier}</TableCell>
            <TableCell scope="col">{COMMISSION_COPY.colTravel}</TableCell>
            <TableCell scope="col" align="right">{COMMISSION_COPY.colGross}</TableCell>
            <TableCell scope="col" align="right">{COMMISSION_COPY.colRate}</TableCell>
            <TableCell scope="col" align="right">{COMMISSION_COPY.colCommission}</TableCell>
            <TableCell scope="col">{COMMISSION_COPY.colStatus}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.commissionId}>
              {/* The row's header, so a screen reader names each cell by its trip. */}
              <TableCell component="th" scope="row" sx={{ maxWidth: 280 }}>
                {row.tripHref ? (
                  <MuiLink
                    component={NextLink}
                    href={row.tripHref}
                    underline="hover"
                    color="inherit"
                    sx={{ display: "block", minWidth: 0 }}
                  >
                    <Typography
                      component="span"
                      variant="body2"
                      title={row.tripTitle}
                      sx={{ ...TRUNCATE, fontWeight: 500 }}
                    >
                      {row.tripTitle}
                    </Typography>
                  </MuiLink>
                ) : (
                  <Typography
                    component="span"
                    variant="body2"
                    title={row.tripTitle}
                    sx={{ ...TRUNCATE, fontWeight: 500 }}
                  >
                    {row.tripTitle}
                  </Typography>
                )}
                <Typography component="span" variant="caption" sx={{ ...TRUNCATE, color: "text.secondary" }}>
                  {row.clientName}
                  {row.tripArchived && ` · ${COMMISSION_COPY.archivedTrip}`}
                </Typography>
              </TableCell>
              <TableCell sx={{ color: "text.secondary" }}>{row.supplierName}</TableCell>
              <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                {row.travelLabel ?? COMMISSION_COPY.noDates}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: "mono" }}>
                {row.grossLabel}
              </TableCell>
              <TableCell align="right" sx={{ color: "text.secondary" }}>
                {row.rateLabel}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: "mono", fontWeight: 700, color: "primary.main" }}>
                {row.commissionLabel}
              </TableCell>
              <TableCell>
                <StatusChip kind={row.statusChip} label={row.statusLabel} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
