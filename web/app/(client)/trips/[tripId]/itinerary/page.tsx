import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { TAP_TARGET } from "@/lib/mui/sx";
import { formatTripDates } from "@/lib/trips/format";
import { loadItinerary } from "@/lib/trips/queries";
import { BACK_LINK, BTN_SM, HEADER_BAND, HEADLINE, PAD, PROSE_COL, TITLE_S } from "../sx";
import { ITINERARY } from "./content";
import {
  ActivityCard,
  EmptyComponentCard,
  EmptyComponentStates,
  ImportantInfo,
} from "./ItineraryParts";

export const metadata: Metadata = { title: "Itinerary" };

/**
 * The sticky day strip. `top` is the authenticated top bar's height and z-index 20 sits
 * under the bar's 30 — the stacking the shell depends on (components/client/ClientTopBar.tsx).
 * The background is the page colour at 95% over a blur, so the content scrolling under it
 * reads as behind it; a palette colour cannot carry an alpha, so it is mixed from the theme's
 * own variable and follows the scheme the same way.
 */
const DAY_STRIP = {
  position: "sticky",
  top: "var(--client-topbar-h)",
  zIndex: 20,
  borderBottom: 1,
  borderColor: "divider",
  bgcolor: "color-mix(in srgb, var(--mui-palette-background-default) 95%, transparent)",
  backdropFilter: "blur(8px)",
} as const;

/** A day section lands below the top bar AND the strip when its chip is followed. */
const DAY_ANCHOR = { scrollMarginTop: "calc(var(--client-topbar-h) + 56px)" } as const;

/**
 * Screen 2.2.4 Itinerary Viewer — see docs/Screen-Inventory.md §2.2.4 and §4.4 (Pattern I:
 * "reading width capped (~720pt) for legibility", a sticky day navigator on the left at web
 * and a horizontal chip strip on mobile) and
 * design/source-prototype/screens/client-trip.jsx (C224_ItineraryViewer) +
 * client-trip-mobile.jsx (M224_ItineraryViewer). P1.
 *
 * Also Screen 2.2.8 Empty Trip Component States, which §4.4 places "inline within Itinerary
 * Viewer" — they are rendered by [EmptyComponentStates] here rather than on a route.
 *
 * EVERY DAY IS RENDERED, not one at a time behind a client-side selector. Pattern I is a
 * READING layout: §4.2's "content parity, not feature parity" and the reading-width cap both
 * point at a document you scroll, and a seven-day trip is a few dozen rows. The day chips
 * are anchor links into it, so they work with no JavaScript, survive a share, and leave
 * 2.2.5 as the place you go for one day in detail rather than a different view of the same
 * thing.
 *
 * "Share with co-traveler" collapses into the PDF. The secure link is deferred to §2.8.
 */
export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const itinerary = await loadItinerary(tripId);

  if (!itinerary) {
    // An unpublished itinerary is invisible to this session, so "not published" and "no
    // itinerary" arrive identically — and the honest thing is the gentler of the two, since
    // a trip you can open almost always has a draft behind it.
    return (
      <Box sx={{ ...PROSE_COL, ...PAD }}>
        <EmptyState
          icon="clock"
          title={ITINERARY.notPublishedTitle}
          body={ITINERARY.notPublishedBody}
          action={{ label: ITINERARY.back, href: `/trips/${tripId}` }}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 5 }}>
      <Box component="header" sx={HEADER_BAND}>
        <Box sx={PROSE_COL}>
          <MuiLink component={NextLink} href={`/trips/${tripId}`} underline="hover" sx={BACK_LINK}>
            <Icon name="arrow_left" size={14} /> {ITINERARY.back}
          </MuiLink>
          <Box sx={{ mt: 0.75 }}>
            <StatusChip kind={itinerary.tripChip} label={itinerary.tripStatusLabel} />
          </Box>
          <Typography component="h1" variant="h5" sx={{ ...HEADLINE, mt: 0.75 }}>
            {itinerary.tripTitle}
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {[
              formatTripDates(itinerary.startDate, itinerary.endDate),
              `${itinerary.travelerCount} travelers`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        </Box>
      </Box>

      {itinerary.days.length > 1 && (
        <Box component="nav" aria-label="Days" sx={DAY_STRIP}>
          <Box sx={{ ...PROSE_COL, display: "flex", gap: 0.75, overflowX: "auto", px: { xs: 2, md: 3 }, py: 1.25 }}>
            {itinerary.days.map((day) => (
              // Anchor links drawn as the artboard's day chips. TAP_TARGET grows the touch
              // area to 44px without growing the 32px chip.
              <Chip
                key={day.id}
                component="a"
                href={`#day-${day.dayNumber}`}
                clickable
                label={ITINERARY.dayShort(day.dayNumber)}
                sx={{ ...TAP_TARGET, flexShrink: 0 }}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ ...PROSE_COL, ...PAD }}>
        {/* Design-System §2.4: "the intro note Gyasi writes per trip is the place to let the
            voice come through". It leads, in the script face, because it is the one piece of
            this screen that is not logistics. */}
        {itinerary.introNote && (
          <Typography component="p" variant="body1" sx={{ maxWidth: "65ch", color: "text.secondary" }}>
            {itinerary.introNote}
          </Typography>
        )}

        {itinerary.days.length === 0 ? (
          <Box sx={{ mt: 2.5 }}>
            <EmptyComponentCard
              icon="calendar"
              title={ITINERARY.emptyItineraryTitle}
              body={ITINERARY.emptyItineraryBody}
              big
              tripId={tripId}
            />
          </Box>
        ) : (
          <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 4 }}>
            {itinerary.days.map((day) => (
              <Box component="section" key={day.id} id={`day-${day.dayNumber}`} sx={DAY_ANCHOR}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5 }}>
                  <Typography component="span" variant="script" sx={{ fontSize: 32, color: "primary.main" }}>
                    {ITINERARY.dayLabel(day.dayNumber)}
                  </Typography>
                  <Typography component="span" variant="subtitle1" sx={TITLE_S}>
                    {day.label ?? formatTripDates(day.date, null)}
                  </Typography>
                  <MuiButton
                    component={NextLink}
                    href={`/trips/${tripId}/itinerary/${day.dayNumber}`}
                    variant="text"
                    size="small"
                    sx={{ ...BTN_SM, ml: "auto", flexShrink: 0 }}
                  >
                    Open <Icon name="chevron_right" size={13} />
                  </MuiButton>
                </Box>

                {day.summary && (
                  <Typography component="p" variant="body1" sx={{ mt: 0.5, maxWidth: "65ch", color: "text.secondary" }}>
                    {day.summary}
                  </Typography>
                )}

                <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
                  {day.activities.length === 0 ? (
                    <EmptyComponentCard
                      icon="sparkle"
                      title={ITINERARY.emptyDayTitle(day.dayNumber)}
                      body={ITINERARY.emptyDayBody}
                    />
                  ) : (
                    day.activities.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        <EmptyComponentStates itinerary={itinerary} />

        {itinerary.closingNote && (
          <Typography
            component="p"
            variant="script"
            sx={{ display: "block", mt: 4, fontSize: 24, lineHeight: 1.25, color: "primary.main" }}
          >
            {itinerary.closingNote}
          </Typography>
        )}

        <Box sx={{ mt: 4, display: "flex", flexDirection: "column", gap: 1.5 }}>
          {/* The PDF export is not built — it needs a renderer and a signed download, both
              §2.2.4 work that did not fit this stage. Disabled and saying so beats a button
              that produces nothing. */}
          <Button
            variant="tonal"
            fullWidth
            disabled
            aria-disabled="true"
            title="PDF export arrives with the next release"
          >
            <Icon name="download" size={14} /> {ITINERARY.downloadPdf}
          </Button>
          <Typography component="p" variant="body2" sx={{ textAlign: "center", color: "text.secondary" }}>
            {ITINERARY.shareNote}
          </Typography>
          <ImportantInfo itinerary={itinerary} />
        </Box>
      </Box>
    </Box>
  );
}
