import Image from "next/image";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { UP_WEB } from "@/lib/mui/sx";
import { formatDayLong } from "@/lib/public/dates";
import type { PublicSailing, ShipImage } from "@/lib/public/cruises";
import { requestQuoteHref } from "@/lib/public/links";
import { RESULTS } from "./content";
import { CARD_CTA_SX, TAG_SX } from "./ResultCard";

/**
 * One synced sailing (design: the C204 row, and the 2.3.4 cruise card it is closest to).
 *
 * NO FARE ANYWHERE ON THIS CARD, by construction rather than by omission: `PublicSailing`
 * has no price field, because the Edge Function does not select one. Free-Travel-APIs §4.7 —
 * "launch without it" — is the rule, and §1.3.4/§9.2 are why. The price column that would
 * otherwise sit on the right of a C204 row carries the itinerary instead, which is what
 * someone choosing a cruise is actually reading for. THAT STILL HOLDS — the photo added a
 * column on the left, and took nothing from the itinerary.
 *
 * The whole card is the link, same as a hotel: a sailing has no detail page either, so
 * there is exactly one thing to do with it.
 *
 * THE PHOTO IS A 180px COLUMN ON WEB, not a banner, for the reason HotelCard is a row: an
 * aspect-video header on a 1200px card is most of a viewport, and a results list is meant to
 * be scanned. One set of markup rather than HotelCard's two, because unlike a hotel the body
 * does not change between the layouts — only the photo's box does.
 */
export function CruiseCard({ sailing }: { sailing: PublicSailing }) {
  const quote = requestQuoteHref({
    kind: "cruise",
    tripType: "cruise",
    source: "track_cruises",
    name: sailing.title,
    place: sailing.destinations[0],
    checkIn: sailing.departureDate,
    // The sailing's own length is the stay — a cruise quote has no separate check-out to ask
    // for, which is why the search bar's dates do not reach this card.
    checkOut: sailing.nights ? addNights(sailing.departureDate, sailing.nights) : undefined,
    ref: sailing.id,
  });

  const overline = [sailing.line, sailing.nights ? RESULTS.cruises.nights(sailing.nights) : null]
    .filter(Boolean)
    .join(" · ");

  const shown = sailing.ports.slice(0, 4);
  const rest = sailing.ports.length - shown.length;

  return (
    <Card
      component="article"
      sx={{
        position: "relative",
        display: "grid",
        // ONLY TWO COLUMNS WHEN THERE IS SOMETHING TO PUT IN THE FIRST ONE. Most sailings
        // have no photo: the catalog covers 151 curated hulls, but the sync mints a stub
        // `cruise_ship` for any ship name it has not seen, and a stub has no imagery. An
        // unconditional `180px 1fr` left those cards with a 180px hole.
        ...(sailing.shipImage && { [UP_WEB]: { gridTemplateColumns: "180px 1fr" } }),
      }}
    >
      {sailing.shipImage && (
        <Box
          sx={{
            position: "relative",
            aspectRatio: "16 / 9",
            bgcolor: "surface.3",
            [UP_WEB]: { aspectRatio: "auto", height: "100%", minHeight: 120 },
          }}
        >
          <Image
            src={sailing.shipImage.url}
            // Decorative: the ship's name is already read out one element below, so a
            // description here would announce it twice. Same call HotelCard makes.
            alt=""
            fill
            sizes="(min-width: 1200px) 180px, 100vw"
            // Wikimedia sees the visitor's IP the moment this loads; sending the page they
            // were on as well is gratuitous. Same reasoning as the hotel photos.
            referrerPolicy="no-referrer"
            style={{ objectFit: "cover" }}
          />
        </Box>
      )}
      <Box sx={{ minWidth: 0, px: 2, py: 1.75, [UP_WEB]: { px: 2.25 } }}>
        {overline && <Chip size="small" color="tertiary" label={overline} sx={TAG_SX} />}
        <Typography component="h2" variant="h5" sx={{ mt: 0.75, mb: 0.25 }}>
          {/* `.link-stretch` stays as the hook — see HotelCard for why it cannot move into sx. */}
          <MuiLink component={NextLink} href={quote} className="link-stretch" color="inherit" underline="hover">
            {sailing.title}
          </MuiLink>
        </Typography>

        <Typography
          component="p"
          variant="caption"
          sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 0.75, color: "text.secondary" }}
        >
          <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "brand.main" }}>
            <Icon name="ship" size={12} />
          </Box>
          {sailing.ship}
          <span aria-hidden="true">·</span>
          {RESULTS.cruises.sailsOn} {formatDayLong(sailing.departureDate)}
        </Typography>

        {shown.length > 0 && (
          <Box sx={{ mt: 1.25 }}>
            <Typography component="p" variant="caption" sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}>
              {RESULTS.cruises.itinerary}
            </Typography>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {shown.map((port) => (
                <Chip key={port} component="li" size="small" variant="outlined" label={port} sx={{ color: "text.secondary" }} />
              ))}
              {rest > 0 && (
                <Chip
                  component="li"
                  size="small"
                  variant="outlined"
                  label={RESULTS.cruises.morePorts(rest)}
                  sx={{ color: "text.secondary" }}
                />
              )}
            </Box>
          </Box>
        )}

        {sailing.shipImage && <PhotoCredit image={sailing.shipImage} />}

        <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          {/* A span, not a link: the card already is one. Out of the tab order and hidden from
              assistive tech; the stretched anchor sits above it and takes the click. */}
          <MuiButton
            component="span"
            aria-hidden="true"
            tabIndex={-1}
            disableRipple
            variant="contained"
            size="small"
            sx={CARD_CTA_SX}
          >
            {RESULTS.cruises.quote}
          </MuiButton>
        </Box>
      </Box>
    </Card>
  );
}

/**
 * The attribution line. THIS IS A LICENCE CONDITION, NOT A CAPTION.
 *
 * Every ship photo is CC BY or CC BY-SA, and both require credit wherever the work appears.
 * `PublicSailing` cannot carry a photo without one — `ShipImage` nests the pair, the Edge
 * Function drops a photo whose credit is missing, and `cruise_ship_image_attributed` stops
 * the pair being half-written in the first place. This component is the end of that chain:
 * if it is deleted, the photo above becomes a breach, so it is rendered by the same
 * `sailing.shipImage &&` guard rather than by a separate condition that could drift.
 *
 * IT IS NOT TRUNCATED, and that rules out the tidier designs. Commons attribution runs to
 * whole sentences — the longest in the catalog is 214 characters — and an ellipsis through
 * the middle of an author's name is not attribution. So it sits at full card width under the
 * body, where it can wrap, rather than overlaid on a 180px-wide photo where it could not.
 *
 * `position: relative; zIndex: 2` lifts the Commons link above `.link-stretch::after`, which
 * covers the card at `z-index: 1`. Without it the anchor renders, reads correctly to a screen
 * reader, and cannot be clicked — the card swallows every press.
 */
function PhotoCredit({ image }: { image: ShipImage }) {
  return (
    <Typography component="p" variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
      {RESULTS.cruises.photoCredit}{" "}
      {image.sourceUrl ? (
        <MuiLink
          href={image.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          color="inherit"
          underline="always"
          sx={{ position: "relative", zIndex: 2, textUnderlineOffset: 2, "&:hover": { color: "text.primary" } }}
        >
          {image.credit}
        </MuiLink>
      ) : (
        image.credit
      )}
    </Typography>
  );
}

/** Departure + nights, as a civil date. Kept off `Date` arithmetic for the usual reason. */
function addNights(iso: string, nights: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + nights);
  return date.toISOString().slice(0, 10);
}
