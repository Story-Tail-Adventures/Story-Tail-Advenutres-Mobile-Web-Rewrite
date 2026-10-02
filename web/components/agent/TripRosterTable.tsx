import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { SelectAllTrips, TripPickCheckbox } from "@/components/agent/TripBulkStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { TRIP_COPY } from "@/lib/agent/content";
import type { TripRosterRow } from "@/lib/agent/trips";

/**
 * Screen 3.4.1's rows — §4.4 Pattern B, web half.
 *
 * ONE STRUCTURE, NOT §3.3.1's TWO. That screen builds a real `<table>` for the desk AND a
 * real card list for the phone, because Clients is one of the four agent tabs on a phone.
 * Trips is not (§6.6), and §3.4 has no phone artboards at all — so a second structure here
 * would be markup nobody can reach, kept in step by hand forever.
 *
 * EVERY ROW CARRIES ITS STAGE INTO THE CHECKBOX, as `tripId:fromStatus`. Setting a stage
 * overwrites, so the bulk write refuses to move a trip whose stage has changed since this
 * page rendered — and the value is where it learns what the page was showing.
 *
 * ON MUI's Table (step 2 of the migration, PR 6), the way the artboard draws it: stock
 * `size="small"` cells in a Card, the row's title at 600, meta in text.secondary, money in
 * the mono face. Still a Server Component; the two checkboxes are the client islands
 * `TripBulkStatus.tsx` exports.
 */

/** A single-line cell text that clips rather than wraps, as the legacy `truncate` did. */
const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function TripRosterTable({ rows }: { rows: TripRosterRow[] }) {
  return (
    <Card sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ width: "100%" }}>
        <TableHead>
          <TableRow>
            {/* `padding="checkbox"` fixes the column's width so nothing shifts when the
                select-all appears on hydration. See SelectAllTrips. */}
            <TableCell scope="col" padding="checkbox">
              <SelectAllTrips />
            </TableCell>
            <TableCell scope="col">{TRIP_COPY.colTrip}</TableCell>
            <TableCell scope="col">{TRIP_COPY.colClient}</TableCell>
            <TableCell scope="col">{TRIP_COPY.colTravel}</TableCell>
            <TableCell scope="col">{TRIP_COPY.colStage}</TableCell>
            <TableCell scope="col" align="right">{TRIP_COPY.colValue}</TableCell>
            <TableCell scope="col" align="right">{TRIP_COPY.colCommission}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.tripId} hover>
              <TableCell padding="checkbox">
                <TripPickCheckbox
                  value={`${row.tripId}:${row.status}`}
                  label={`${TRIP_COPY.bulkSelectRow} ${row.title}`}
                />
              </TableCell>
              <TableCell>
                <MuiLink
                  component={NextLink}
                  href={`/agent/trips/${row.tripId}`}
                  underline="hover"
                  color="inherit"
                  sx={{ display: "block", minWidth: 0 }}
                >
                  <Typography component="span" variant="body2" sx={{ ...TRUNCATE, fontWeight: 600 }}>
                    {row.title}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ...TRUNCATE, color: "text.secondary" }}
                  >
                    {row.destinationLabel ?? TRIP_COPY.noDestination}
                    {row.componentCount > 0 && ` · ${row.componentCount}`}
                  </Typography>
                </MuiLink>
              </TableCell>
              <TableCell sx={{ color: "text.secondary" }}>
                <MuiLink
                  component={NextLink}
                  href={`/agent/clients/${row.clientId}`}
                  underline="hover"
                  color="inherit"
                >
                  {row.clientName}
                </MuiLink>
              </TableCell>
              <TableCell sx={{ color: "text.secondary", fontWeight: 500 }}>
                {row.travelLabel ?? TRIP_COPY.noDates}
              </TableCell>
              <TableCell>
                <StatusChip kind={row.statusChip} label={row.statusLabel} />
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: "mono", fontWeight: 700 }}>
                {row.valueLabel}
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: "mono", color: "primary.main" }}>
                {row.commissionLabel ?? TRIP_COPY.noCommission}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
