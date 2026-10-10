import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientTripRow } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.4 — every trip this client has, current and past.
 *
 * THE THREE CHIPS ARE COUNTS OVER ONE ROW SET, not three reads. `agent_client_trips`
 * returns the client's whole book once and `bucket` is computed in the view model; asking
 * the database three times for three slices of the same rows would be three round trips to
 * render one tab.
 *
 * ROWS LINK INTO §3.4.2, which is the first cross-section link on the agent side and the
 * reason the roster's rows do NOT link anywhere: trip detail is built, client detail was
 * not until now. `/agent/trips/[tripId]` is a real route.
 *
 * NO IMAGES. The prototype draws a 120px photo on every row. `trip` has no image column —
 * the client-side trip cards use curated content keyed by destination, which is a Phase 2
 * catalog concern — so a row that reserved space for one would render a grey box on every
 * line. Dropped rather than faked, the same call §3.2.1's KPI deltas got.
 *
 * ON MUI (step 2 of the migration, PR 6): outlined Chips for the counts, each row a Card
 * that is a link (the shape the roster's phone cards use), money in the mono face and the
 * `StatusChip` for the stage. Plain sx, so this stays a Server Component.
 */

/** The legacy `.btn.btn-sm` box on an MUI Button: 32px tall, 16px sides, 8px icon gap. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/** A single-line text that clips rather than wraps, as the legacy `truncate` did. */
const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function ClientTripsTab({
  trips,
  clientId,
}: {
  trips: ClientTripRow[];
  clientId: string;
}) {
  if (trips.length === 0) {
    // EVEN WITH NO TRIPS THE CTA BELONGS HERE, and it did not before: this tab used to
    // return a bare sentence, which meant the one client most likely to need a new trip —
    // the one with none — was the only client whose tab could not start one.
    return (
      <Box sx={{ px: 0.5, py: 2 }}>
        <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
          {CLIENT_COPY.tripsEmpty}
        </Typography>
        <MuiButton
          component={NextLink}
          href={`/agent/trips/new?client=${clientId}`}
          variant="contained"
          color="brand"
          size="small"
          sx={{ ...BTN_SM, mt: 1.5 }}
        >
          <Icon name="plus" size={12} /> New trip
        </MuiButton>
      </Box>
    );
  }

  const counts = {
    active: trips.filter((t) => t.bucket === "active").length,
    past: trips.filter((t) => t.bucket === "past").length,
    cancelled: trips.filter((t) => t.bucket === "cancelled").length,
  };

  return (
    <>
      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        <Chip variant="outlined" label={`${CLIENT_COPY.tripsActive} · ${counts.active}`} />
        <Chip variant="outlined" label={`${CLIENT_COPY.tripsPast} · ${counts.past}`} />
        <Chip variant="outlined" label={`${CLIENT_COPY.tripsCancelled} · ${counts.cancelled}`} />
        {/* Live as of §3.4.3, and it carries the client so the next screen does not ask
            again for somebody this one already knows. */}
        <MuiButton
          component={NextLink}
          href={`/agent/trips/new?client=${clientId}`}
          variant="contained"
          color="brand"
          size="small"
          sx={{ ...BTN_SM, ml: "auto" }}
        >
          <Icon name="plus" size={12} /> New trip
        </MuiButton>
      </Box>

      <Box
        component="ul"
        sx={{ m: 0, p: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 1 }}
      >
        {trips.map((t) => (
            <li key={t.tripId}>
              <Card
                component={NextLink}
                href={`/agent/trips/${t.tripId}`}
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.75,
                  py: 1.5,
                  color: "inherit",
                  textDecoration: "none",
                  "&:hover": { bgcolor: "surface.2" },
                }}
              >
                <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                  <Typography component="span" variant="subtitle1" sx={{ ...TRUNCATE, fontWeight: 600, lineHeight: 1.3 }}>
                    {t.title}
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ ...TRUNCATE, color: "text.secondary" }}>
                    {[t.datesLabel, t.destinations[0]].filter(Boolean).join(" · ") || "—"}
                  </Typography>
                </Box>
                <Box component="span" sx={{ flexShrink: 0, textAlign: "right" }}>
                  <Typography component="span" variant="body2" sx={{ display: "block", fontFamily: "mono", fontWeight: 700 }}>
                    {t.valueLabel}
                  </Typography>
                  <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {CLIENT_COPY.tripCommissionPrefix} {t.commissionLabel}
                  </Typography>
                </Box>
                <StatusChip kind={t.statusChip} label={t.statusLabel} />
              </Card>
            </li>
        ))}
      </Box>
    </>
  );
}
