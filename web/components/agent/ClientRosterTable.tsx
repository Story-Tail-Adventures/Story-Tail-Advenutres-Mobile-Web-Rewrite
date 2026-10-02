import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import { ClientRowCheckbox, SelectAllClients } from "@/components/agent/ClientBulkTag";
import NextLink from "@/components/mui/NextLink";
import { Avatar } from "@/components/public/Avatar";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientRosterRow } from "@/lib/agent/clients";

/**
 * Screen 3.3.1's rows — §4.4 Pattern B, which asks for two genuinely different structures.
 *
 * TWO STRUCTURES, NOT ONE RESTYLED. Pattern B's web half is "a true data table with sortable
 * column headers, sticky header row"; its mobile half is "a vertical list of cards, one item
 * per row". Those are not the same tree with different CSS. Collapsing a `<table>` to
 * `display:block` on a phone is the usual shortcut and it silently drops the table role from
 * the accessibility tree — the headers stop being announced with their cells, which is the
 * one thing the table was for. So the cards are a real `<ul>` and the table is a real
 * `<table>`, and exactly one is in the layout at a time.
 *
 * The duplication is 25 rows of markup. The alternative is a structure that lies to a screen
 * reader at whichever width it lies at.
 *
 * ROWS LINK INTO §3.3.2 as of 2026-09-26. Until the detail screen existed they were plain
 * list items, on §3.2.1's rule that a row wired to nothing is worse than a row that is
 * plainly not a link. It exists now, so they are links — on BOTH layouts, because a phone
 * row is the one most likely to be tapped.
 *
 * THE BULK-SELECT COLUMN IS ON THE TABLE ONLY, as of 2026-09-26. It was cut entirely while
 * nothing consumed it — §6.4's rule that a control doing nothing is worse than no control —
 * and it arrives now with bulk-tag behind it. It does NOT arrive on the phone cards, and
 * that is the prototype's own line as well as §6.6's: a card row is one `<Link>` covering
 * the whole card, a checkbox inside an anchor is neither valid nor clickable, and tagging
 * twenty-five clients at once is not one of the "on-the-go tasks" §6.6 scopes the phone to.
 *
 * ON MUI's Table (step 2 of the migration, PR 6), drawn the way §3.4.1's `TripRosterTable`
 * is so the two rosters read as one: stock `size="small"` cells in a Card, a
 * `padding="checkbox"` column that holds its width before the select-all hydrates, the
 * row's name at 600, meta in text.secondary, money in the mono face, and the artboard's
 * 20px tag chips. `scope="col"` stays on every header cell. The phone rows are Cards that
 * are links. Plain sx throughout, so this stays a Server Component; the checkboxes are the
 * client islands `ClientBulkTag.tsx` exports.
 */

/** A single-line cell text that clips rather than wraps, as the legacy `truncate` did. */
const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/** `.chip.h-5.px-2.text-[10.5px]`: the 20px tag chip, as the A331 artboard draws it. */
const MINI_CHIP_SX = { height: 20, fontSize: 10.5, "& .MuiChip-label": { px: 1 } } as const;

function RowMeta({ row }: { row: ClientRosterRow }) {
  return (
    <>
      <Typography component="span" variant="body2" sx={{ ...TRUNCATE, fontWeight: 600 }}>
        {row.displayName}
      </Typography>
      <Typography component="span" variant="caption" sx={{ ...TRUNCATE, color: "text.secondary" }}>
        {row.email ?? CLIENT_COPY.noEmail}
      </Typography>
    </>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <Box component="span" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {tags.map((t) => (
        <Chip key={t} size="small" variant="outlined" label={t} sx={MINI_CHIP_SX} />
      ))}
    </Box>
  );
}

/**
 * The money cell. A dash, never "$0.00": the accessor returns a NULL currency for a client
 * with nothing committed, and a labelled zero would claim they have spent nothing where the
 * truth is that nothing has been booked yet.
 */
function Lifetime({ row }: { row: ClientRosterRow }) {
  if (!row.lifetimeLabel) {
    return (
      <Box component="span" sx={{ color: "text.secondary" }}>
        {CLIENT_COPY.noLifetime}
      </Box>
    );
  }
  return (
    <Box component="span" sx={{ fontFamily: "mono", fontWeight: 700 }}>
      {row.lifetimeLabel}
    </Box>
  );
}

function NextTrip({ row }: { row: ClientRosterRow }) {
  if (!row.nextTripLabel) {
    return (
      <Box component="span" sx={{ color: "text.secondary" }}>
        {CLIENT_COPY.noTrip}
      </Box>
    );
  }
  return (
    <Box component="span" sx={row.nextTripIsNow ? { fontWeight: 600, color: "primary.main" } : undefined}>
      {row.nextTripLabel}
    </Box>
  );
}

export function ClientRosterTable({ rows }: { rows: ClientRosterRow[] }) {
  return (
    <>
      {/* ── Phone: a list of cards (Pattern B mobile) ─────────────────────── */}
      <Box
        component="ul"
        sx={{
          m: 0,
          p: 0,
          listStyle: "none",
          display: { xs: "flex", md: "none" },
          flexDirection: "column",
          gap: 1,
        }}
      >
        {rows.map((row) => (
          <li key={row.clientId}>
            <Card
              component={NextLink}
              href={`/agent/clients/${row.clientId}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.75,
                py: 1.5,
                color: "inherit",
                textDecoration: "none",
                "&:hover": { bgcolor: "surface.2" },
              }}
            >
              <Avatar initials={row.initials} size={32} tone="brand" />
              <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                <RowMeta row={row} />
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ...TRUNCATE, mt: 0.5, color: "text.secondary" }}
                >
                  {row.nextTripLabel ?? row.lastTripLabel ?? CLIENT_COPY.noTrip}
                </Typography>
              </Box>
              <Typography component="span" variant="body2" sx={{ flexShrink: 0, textAlign: "right" }}>
                <Lifetime row={row} />
              </Typography>
            </Card>
          </li>
        ))}
      </Box>

      {/* ── Tablet and up: the data table (Pattern B web) ─────────────────── */}
      <Card sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
        <Table size="small" sx={{ width: "100%" }}>
          <TableHead>
            <TableRow>
              {/* `padding="checkbox"` fixes the column's width so nothing shifts when the
                  select-all appears on hydration. See SelectAllClients. */}
              <TableCell scope="col" padding="checkbox">
                <SelectAllClients />
              </TableCell>
              <TableCell scope="col">{CLIENT_COPY.colClient}</TableCell>
              <TableCell scope="col">{CLIENT_COPY.colLastTrip}</TableCell>
              <TableCell scope="col">{CLIENT_COPY.colNextTrip}</TableCell>
              <TableCell scope="col" align="right">{CLIENT_COPY.colLifetime}</TableCell>
              <TableCell scope="col">{CLIENT_COPY.colTags}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.clientId} hover>
                <TableCell padding="checkbox">
                  <ClientRowCheckbox
                    value={row.clientId}
                    label={`${CLIENT_COPY.bulkSelectRow} ${row.displayName}`}
                  />
                </TableCell>
                <TableCell>
                  <Box component="span" sx={{ display: "flex", minWidth: 0, alignItems: "center", gap: 1.25 }}>
                    <Avatar initials={row.initials} size={32} tone="brand" />
                    <MuiLink
                      component={NextLink}
                      href={`/agent/clients/${row.clientId}`}
                      underline="hover"
                      color="inherit"
                      sx={{ display: "block", minWidth: 0 }}
                    >
                      <RowMeta row={row} />
                    </MuiLink>
                  </Box>
                </TableCell>
                <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>
                  {row.lastTripLabel ?? CLIENT_COPY.noTrip}
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>
                  <NextTrip row={row} />
                </TableCell>
                <TableCell align="right">
                  <Lifetime row={row} />
                </TableCell>
                <TableCell>
                  <Tags tags={row.tags} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
