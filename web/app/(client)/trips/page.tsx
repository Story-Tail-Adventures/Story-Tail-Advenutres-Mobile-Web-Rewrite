import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { TAP_TARGET, UP_MD } from "@/lib/mui/sx";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { formatTripDates } from "@/lib/trips/format";
import { isTripFilter, loadTrips, type DashboardTrip, type TripFilter } from "@/lib/trips/queries";
import { TRIPS } from "./content";

export const metadata: Metadata = { title: "My trips" };

/** The page column: 1024px wide, 16px sides (24 from md), a 40px tail below md. */
const PAGE_SX = {
  mx: "auto",
  width: "100%",
  maxWidth: 1024,
  p: { xs: 2, md: 3 },
  pb: { xs: 5, md: 3 },
} as const;

/** `.t-headline` on `variant="h5"`: stock size, the weight is the legacy one. */
const HEADLINE_SX = { fontWeight: 700 } as const;

/** The legacy .btn-sm box on MUI's Button, so nothing reflows. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/**
 * Screen 2.2.2 All Trips List — see docs/Screen-Inventory.md §2.2.2 and §4.4 (Pattern B,
 * with no stated deviation, so it follows Pattern B's defaults) and
 * design/source-prototype/screens/client-trip.jsx (C222_AllTrips) + client-trip-mobile.jsx
 * (M222_AllTrips). P1.
 *
 * The filter lives in the URL rather than in client state, which is what makes a tab
 * shareable, back-button-correct and server-rendered. Pattern B's mobile guidance puts
 * search and sort behind icon buttons; both are absent here rather than inert — §4.3 sizes
 * the account at a handful of trips, so a search field over four rows is furniture, and
 * there is no second sort order anybody has asked for yet.
 *
 * DEPARTURE FROM PATTERN B: it is a card list at every width, not a data table on web.
 * Pattern B's web column ("true data table with sortable headers, right-click menu,
 * bulk-select") is written for the AGENT surface, where a hundred rows need scanning. A
 * traveler has four trips and each one is a photograph they recognise before they read the
 * title — the artboard draws image-led cards at 1280px for that reason.
 *
 * ON MUI (step 2 of the migration): the filter tabs are MUI Chips that are links (filled
 * secondary when selected, outlined otherwise, as the C222 artboard and the ChipInput
 * primitive draw a chosen chip), and each row is a Card laid out as the artboard's
 * `200px | 1fr | auto` grid from `md`. Plain sx throughout, so this stays a Server Component.
 */
export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: raw } = await searchParams;
  const filter: TripFilter = isTripFilter(raw) ? raw : "all";
  const data = await loadTrips(filter);

  if (!data) {
    return (
      <Box sx={{ mx: "auto", width: "100%", maxWidth: 1024, p: { xs: 2, md: 3 } }}>
        {/* §5's ERROR state, not the empty one — see the note on the dashboard's. */}
        <RetryState title={TRIPS.errorTitle} body={TRIPS.errorBody} />
      </Box>
    );
  }

  const tabs: Array<{ id: TripFilter; label: string }> = [
    { id: "all", label: TRIPS.tabAll },
    { id: "upcoming", label: TRIPS.tabUpcoming },
    { id: "planning", label: TRIPS.tabPlanning },
    { id: "past", label: TRIPS.tabPast },
    { id: "cancelled", label: TRIPS.tabCancelled },
  ];

  return (
    <Box sx={PAGE_SX}>
      <Typography component="h1" variant="h5" sx={HEADLINE_SX}>
        {TRIPS.title}
      </Typography>
      <Typography component="p" variant="body2" sx={{ mt: 0.5, maxWidth: "65ch", color: "text.secondary" }}>
        {TRIPS.subtitle}
      </Typography>

      <Box component="nav" aria-label="Filter trips" sx={{ mt: 2, display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
        {tabs.map((tab) => {
          const on = tab.id === filter;
          return (
            // 28px tall, like the ChipInput primitive, so the row keeps its rhythm. The tap
            // area still reaches 44px on touch screens through TAP_TARGET's invisible ::after.
            <Chip
              key={tab.id}
              component={NextLink}
              href={tab.id === "all" ? "/trips" : `/trips?filter=${tab.id}`}
              clickable
              label={`${tab.label} · ${data.counts[tab.id]}`}
              color={on ? "secondary" : "default"}
              variant={on ? "filled" : "outlined"}
              aria-current={on ? "page" : undefined}
              sx={{ ...TAP_TARGET, height: 28, flexShrink: 0 }}
            />
          );
        })}
      </Box>

      {data.trips.length === 0 ? (
        <EmptyState
          icon="palm"
          title={filter === "all" ? TRIPS.emptyAllTitle : TRIPS.emptyFilteredTitle}
          body={filter === "all" ? TRIPS.emptyAllBody : TRIPS.emptyFilteredBody}
        />
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, mt: 2, listStyle: "none", display: "flex", flexDirection: "column", gap: 1.5 }}>
          {data.trips.map((trip) => (
            <li key={trip.id}>
              <TripRow trip={trip} />
            </li>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * The artboard's `200px | 1fr | auto` row on web, collapsing to image-top below `md:`.
 *
 * Trip value is shown because `total_value_cents` is in the client column grant and it is
 * what the trip costs THEM — not `total_commission_cents`, which is the agency's number and
 * is withheld (BRD §10.5).
 *
 * The whole Card is the link, as before. The "Open" affordance at the foot is MUI's outlined
 * secondary Button rendered as a presentational span (`tabIndex={-1}`): it is decoration
 * inside an anchor, not a second control, so it must not be focusable or announced as a
 * button — the legacy markup was a styled span for the same reason.
 */
function TripRow({ trip }: { trip: DashboardTrip }) {
  return (
    <Card
      component={NextLink}
      href={`/trips/${trip.id}`}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "200px 1fr auto" },
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Box sx={{ position: "relative", height: { xs: 140, md: "100%" } }}>
        <Photo
          image={imageKeyForTrip(trip)}
          alt=""
          fill
          sizes="(min-width: 768px) 200px, 100vw"
        />
        {/* The chip rides the photo below md and moves into the body from md (the legacy
            `md:hidden` / `hidden md:inline-flex` pair), so a wrapper carries the breakpoint. */}
        <Box sx={{ position: "absolute", top: 10, left: 10, display: { xs: "block", md: "none" } }}>
          <StatusChip kind={trip.chip} label={trip.statusLabel} />
        </Box>
      </Box>

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <StatusChip kind={trip.chip} label={trip.statusLabel} />
        </Box>
        <Typography component="div" variant="h5" sx={{ mt: 0.75 }}>
          {trip.title}
        </Typography>
        <Typography component="div" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {[formatTripDates(trip.startDate, trip.endDate), trip.destinations[0], `${trip.travelerCount} travelers`]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          borderTop: 1,
          borderColor: "divider",
          p: 2,
          [UP_MD]: {
            minWidth: 160,
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            borderTop: 0,
            borderLeft: 1,
          },
        }}
      >
        <Box>
          <Typography component="div" variant="caption" sx={{ display: "block", fontWeight: 500, lineHeight: 1.3, color: "text.secondary" }}>
            {TRIPS.tripValue}
          </Typography>
          <Typography component="div" variant="h5">
            {formatTripMoney(trip.totalValueCents, trip.currency)}
          </Typography>
        </Box>
        <MuiButton
          component="span"
          role="presentation"
          tabIndex={-1}
          variant="outlined"
          color="secondary"
          size="small"
          sx={{ ...BTN_SM, [UP_MD]: { mt: "auto" } }}
        >
          {TRIPS.open} <Icon name="chevron_right" size={13} />
        </MuiButton>
      </Box>
    </Card>
  );
}
