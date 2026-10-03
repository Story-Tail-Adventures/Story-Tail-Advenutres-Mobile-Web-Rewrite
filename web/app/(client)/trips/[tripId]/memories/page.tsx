import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { EmptyState } from "@/components/client/states";
import NextLink from "@/components/mui/NextLink";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatTripDates } from "@/lib/trips/format";
import { imageKeyForTrip } from "@/lib/trips/imagery";
import { formatTripMoney } from "@/lib/trips/money";
import { loadPastTrip } from "@/lib/trips/queries";
import {
  BACK_LINK,
  BAND_TITLE,
  BTN,
  CARD_PAD,
  HERO_SCRIM,
  OVERLINE,
  PAD,
  PROSE_COL,
  TITLE_S,
} from "../sx";
import { MEMORIES } from "./content";
import { ReflectionForm } from "./ReflectionForm";

export const metadata: Metadata = { title: "Memories" };

/**
 * Glass over the photograph: black at 35% behind white text, blurred. A scrim rather than
 * bare white text, for the same reason 2.2.3's back pill has one.
 */
const GLASS_PILL = {
  ...BACK_LINK,
  px: 1.25,
  py: 0.5,
  borderRadius: 999,
  color: "common.white",
  bgcolor: "color-mix(in srgb, var(--mui-palette-common-black) 35%, transparent)",
  backdropFilter: "blur(8px)",
} as const;

/** The filename pill on a photo tile: the same glass, squarer and darker. */
const TILE_PILL = {
  typography: "caption",
  display: "inline-flex",
  maxWidth: "100%",
  alignItems: "center",
  gap: 0.75,
  px: 1,
  py: 0.5,
  borderRadius: 1,
  color: "common.white",
  bgcolor: "color-mix(in srgb, var(--mui-palette-common-black) 45%, transparent)",
  backdropFilter: "blur(8px)",
} as const;

/**
 * Screen 2.2.11 Past Trip Detail / Memory View — docs/Screen-Inventory.md §2.2.11, §4.4
 * (Pattern I plus a gallery, "photo grid is 1-col on mobile"), and
 * design/source-prototype/screens/client-trip.jsx (C2211_PastTrip) +
 * client-trip-mobile.jsx (M2211_PastTrip). P1.
 *
 * A ROUTE OF ITS OWN, not a branch inside 2.2.3. The workflow that planned this section left
 * 2.2.10 and 2.2.11 as "the detail route when the trip is cancelled/past", and that was the
 * one under-specified thing in it. A cancelled trip genuinely IS the overview with a
 * different summary card — §4.4 calls it a Pattern C variant and that is how it is built. A
 * past trip is not: it is a gallery and a note where the other has tiles and a payment
 * timeline, and §2.2.11's own purpose line says "nostalgic, scaled-back". So `/trips/[id]`
 * redirects here, and this screen redirects back if the trip is not actually past — a URL
 * somebody bookmarked should not show a memory view of a trip they are about to take.
 *
 * THE NOTE FROM GYASI LEADS, above the photos. On the desktop artboard it sits in the right
 * rail; the mobile artboard moves it first and says why, and web follows the mobile artboard
 * here rather than the desktop one: this screen exists for the feeling, and the emotional
 * beat should not be the last thing somebody scrolls past.
 *
 * "Book a similar trip" repoints at the thread. §2.3 is Phase 2, so there is no search to
 * seed — and "Gyasi still has your notes" is both true and the thing a traveler would
 * actually want.
 */
export default async function MemoriesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const past = await loadPastTrip(tripId);

  if (!past) notFound();

  // Guard the other direction. `/trips/[id]` sends `completed` trips here; anything else
  // arriving is a stale link or a hand-typed URL, and the overview is the right screen for
  // it. Without this, a booked trip would render as a memory of something that has not
  // happened.
  if (past.trip.status !== "completed") redirect(`/trips/${tripId}`);

  const { trip } = past;
  // Whole dollars, as the trip-detail glance does: cents on a memory of a trip that ended
  // two years ago is precision nobody asked for.
  const money = formatTripMoney(trip.totalValueCents, trip.currency);

  const snapshot = [
    past.nights !== null ? MEMORIES.snapshotNights(past.nights) : null,
    MEMORIES.snapshotTravelers(trip.travelerCount),
    money ? MEMORIES.snapshotAllIn(money) : null,
  ].filter(Boolean) as string[];

  return (
    <Box sx={{ pb: 5 }}>
      <Box sx={{ position: "relative", height: 230, overflow: "hidden" }}>
        <Photo image={imageKeyForTrip(trip)} alt="" fill sizes="100vw" />
        <Box aria-hidden="true" sx={HERO_SCRIM} />
        <Box sx={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <Box sx={{ ...PROSE_COL, ...PAD }}>
            <MuiLink component={NextLink} href="/trips?filter=past" underline="hover" sx={GLASS_PILL}>
              <Icon name="arrow_left" size={14} /> {MEMORIES.back}
            </MuiLink>
          </Box>
        </Box>
        <Box sx={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <Box sx={{ ...PROSE_COL, ...PAD, color: "common.white" }}>
            <StatusChip kind="past" label={trip.statusLabel} />
            <Typography component="h1" variant="h5" sx={{ ...BAND_TITLE, mt: 1, color: "common.white" }}>
              {trip.title}
            </Typography>
            <Typography component="p" variant="body2" sx={{ opacity: 0.9 }}>
              {[formatTripDates(trip.startDate, trip.endDate), trip.destinations.join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...PROSE_COL, ...PAD, display: "flex", flexDirection: "column", gap: 2 }}>
        {past.noteFromGyasi && (
          <Card
            component="section"
            sx={{ position: "relative", overflow: "hidden", bgcolor: "secondary.container", color: "secondary.onContainer" }}
          >
            {/* The soft disc in the corner, as C2211 draws it: white at 15%. */}
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                top: -24,
                right: -24,
                width: 104,
                height: 104,
                borderRadius: "50%",
                bgcolor: "color-mix(in srgb, var(--mui-palette-common-white) 15%, transparent)",
              }}
            />
            <CardContent sx={{ position: "relative", p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Typography component="p" variant="overline" sx={{ ...OVERLINE, opacity: 0.75 }}>
                {MEMORIES.noteOverline}
              </Typography>
              <Typography component="p" variant="script" sx={{ display: "block", mt: 0.5, fontSize: 28, lineHeight: 1.1 }}>
                {MEMORIES.noteFallbackScript}
              </Typography>
              <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, opacity: 0.9 }}>
                {past.noteFromGyasi}
              </Typography>
            </CardContent>
          </Card>
        )}

        <Box component="section">
          <Typography component="h2" variant="subtitle1" sx={{ ...TITLE_S, mb: 1 }}>
            {MEMORIES.photosHeading(past.photos.length)}
          </Typography>
          {past.photos.length === 0 ? (
            <EmptyState
              icon="sun"
              title={MEMORIES.photosEmptyTitle}
              body={MEMORIES.photosEmptyBody}
            />
          ) : (
            // §4.4: "Photo grid is 1-col on mobile, 3-col on tablet, 4-col on web."
            // This was 1/2/2, and the comment claimed §4.4 sanctioned the two-up — it does
            // not, and attributing my own choice to the doc is worse than the wrong column
            // count. `web` rather than `lg` because §4.1's web breakpoint is 1200.
            <Box
              component="ul"
              sx={{
                m: 0,
                p: 0,
                listStyle: "none",
                display: "grid",
                gap: 1.25,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(3, minmax(0, 1fr))",
                  web: "repeat(4, minmax(0, 1fr))",
                },
              }}
            >
              {past.photos.map((photo) => (
                <Box
                  component="li"
                  key={photo.id}
                  // Shorter as the columns narrow, so a tile stays roughly square rather
                  // than becoming a letterbox at a quarter of the width.
                  sx={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 1,
                    bgcolor: "surface.2",
                    height: { xs: 200, md: 150, web: 130 },
                    "& img": { opacity: 0.45 },
                  }}
                >
                  {/* The stored object is NOT rendered here. Showing it would mean signing a
                      URL per photograph on every page load — a five-minute URL and an
                      `audit_event` each, for images nobody may look at. The library at
                      2.2.6 is where a photograph gets opened, and it signs on demand. So
                      this is the filename over the trip's own hero image, which is honest
                      about being a placeholder rather than pretending to be the photo. */}
                  <Photo
                    image={imageKeyForTrip(trip)}
                    alt=""
                    fill
                    sizes="(min-width: 1200px) 25vw, (min-width: 768px) 33vw, 100vw"
                  />
                  <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", p: 1.5 }}>
                    <MuiLink component={NextLink} href={`/trips/${tripId}/documents`} underline="hover" sx={TILE_PILL}>
                      <Icon name="external" size={12} />
                      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {photo.filename}
                      </Box>
                    </MuiLink>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {/* A disabled MUI button has `pointer-events: none`, so the reason in its `title`
              would never show on hover; the wrapper carries it (the components/ui/Button
              idiom). Dashed, as the artboard's "Add more" tile is. */}
          <Box component="span" title={MEMORIES.addPhotosDeferred} sx={{ display: "block", mt: 1.25, cursor: "not-allowed" }}>
            <MuiButton
              type="button"
              variant="outlined"
              fullWidth
              disabled
              aria-disabled="true"
              title={MEMORIES.addPhotosDeferred}
              sx={{ ...BTN, borderStyle: "dashed" }}
            >
              <Icon name="upload" size={14} /> {MEMORIES.addPhotos}
            </MuiButton>
          </Box>
        </Box>

        <ReflectionForm tripId={tripId} reflection={past.reflection} />

        {snapshot.length > 0 && (
          <Card component="section">
            <CardContent sx={CARD_PAD}>
              <Typography component="h2" variant="overline" sx={{ ...OVERLINE, color: "text.secondary" }}>
                {MEMORIES.snapshotHeading}
              </Typography>
              <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, fontWeight: 500 }}>
                {snapshot.join(" · ")}
              </Typography>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.25 }}>
          {/* Only offered when there is a readable itinerary. An unpublished one is
              invisible to this session, so the link would land on "not published yet" for a
              trip that finished two years ago — which reads as broken, not as absent. */}
          {past.itineraryReady && (
            <MuiButton
              component={NextLink}
              href={`/trips/${tripId}/itinerary`}
              variant="outlined"
              color="secondary"
              sx={{ ...BTN, flex: 1 }}
            >
              <Icon name="calendar" size={14} /> {MEMORIES.itineraryCta}
            </MuiButton>
          )}
          {past.documentCount > 0 && (
            <MuiButton
              component={NextLink}
              href={`/trips/${tripId}/documents`}
              variant="outlined"
              sx={{ ...BTN, flex: 1 }}
            >
              <Icon name="passport" size={14} /> {MEMORIES.documentsCta}
            </MuiButton>
          )}
        </Box>

        <Card component="section" sx={{ bgcolor: "primary.container", color: "primary.onContainer" }}>
          <CardContent sx={CARD_PAD}>
            <Typography component="h2" variant="subtitle1" sx={TITLE_S}>
              {MEMORIES.againHeading}
            </Typography>
            <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.9 }}>
              {MEMORIES.againBody}
            </Typography>
            <MuiButton
              component={NextLink}
              href={`/trips/${tripId}/messages`}
              variant="contained"
              fullWidth
              sx={{ ...BTN, mt: 1.25 }}
            >
              <Icon name="message" size={14} /> {MEMORIES.againCta}
            </MuiButton>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
