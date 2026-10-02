import Image from "next/image";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { PublicHotel } from "@/lib/public/hotels";
import { requestQuoteHref } from "@/lib/public/links";
import { formatMoney } from "@/lib/public/money";
import { RESULTS } from "./content";
import { CARD_CTA_SX, PRICE_COLUMN_SX, TAG_SX } from "./ResultCard";

/**
 * One live hotel (design: the C233 row — 180px photo | body | rate column — which is the
 * same grid as C204's trip row, and the M204 stacked card below `web`).
 *
 * A separate component from `ResultCard` rather than a variant of it: a hotel has no
 * catalog slug and so no detail route, its photo is a remote URL rather than a registry
 * key, and its price is an indicative nightly rate rather than a per-person trip total.
 * Threading a `Trip | PublicHotel` union through every line of ResultCard would make both
 * harder to read than two files.
 *
 * THE NAME IS NOT A LINK. There is no public hotel detail page, and a dead link is worse
 * than no link. The terminal action is a quote request, per §1.3.2.
 *
 * `PublicHotel` has no field for a booking site, so nothing here can render one even by
 * accident — see web/lib/public/hotels.ts.
 */
export function HotelCard({
  hotel,
  next: _next,
  stay,
  travelers,
  destination,
}: {
  hotel: PublicHotel;
  next: string;
  stay?: { checkIn: string; checkOut: string };
  travelers?: number;
  /** What the visitor searched for. The provider gives no clean city string per property. */
  destination?: string;
}) {
  // Until now this was `joinHref({ intent: "quote", next })`, which carried the RESULTS page
  // and nothing about the hotel — the request arrived unable to say what it was for. A hotel
  // has no catalog slug to reference, so the identifying fields travel in the link.
  const quote = requestQuoteHref({
    kind: "hotel",
    tripType: "custom",
    source: "serpapi_google_hotels",
    name: hotel.name,
    // The SEARCH destination, not the property type — which is what this was, so a trip came
    // out titled "La Quinta Inn & Suites · hotel". The provider returns no clean city string
    // per property (only coordinates), and "the place they searched" is the honest answer:
    // it is what the traveler asked for and what Gyasi needs to see on the inquiry.
    place: destination,
    checkIn: stay?.checkIn,
    checkOut: stay?.checkOut,
    travelers,
    ref: hotel.propertyToken ?? undefined,
    rateCents: hotel.nightlyCents ?? undefined,
    hotelClass: hotel.hotelClass ?? undefined,
    rating: hotel.rating ?? undefined,
    propertyType: hotel.propertyType ?? undefined,
  });
  const rate = hotel.nightlyCents !== null
    ? formatMoney({ amountCents: hotel.nightlyCents, currency: hotel.currency }, { whole: true })
    : null;

  const overline = [
    hotel.hotelClass ? RESULTS.hotels.starClass(hotel.hotelClass) : null,
    hotel.propertyType,
  ].filter(Boolean).join(" · ");

  const sub = (
    <>
      {hotel.rating !== null && (
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, verticalAlign: "baseline" }}>
          <Box component="span" sx={{ display: "inline-flex", color: "brandSource.sunset" }}>
            <Icon name="star" size={11} filled />
          </Box>
          {hotel.rating}
        </Box>
      )}
      {hotel.rating !== null && hotel.reviewCount ? " · " : null}
      {hotel.reviewCount ? RESULTS.hotels.reviews(hotel.reviewCount) : null}
    </>
  );

  const amenities = hotel.amenities.slice(0, 4);

  /** INDICATIVE / rate / per night. The row sets it in h5 like a trip's price; the stacked card in h6. */
  const price = (variant: "h5" | "h6") => (
    <>
      <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
        {RESULTS.hotels.indicative}
      </Typography>
      {rate ? (
        <Typography component="p" variant={variant} sx={{ my: 0.25, ...(variant === "h6" && { fontWeight: 700, lineHeight: 1.2 }) }}>
          {rate}
          <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
            {" "}
            {RESULTS.hotels.perNight}
          </Typography>
        </Typography>
      ) : (
        <Typography component="p" variant="caption" sx={{ display: "block", my: 0.25, color: "text.secondary" }}>
          {RESULTS.hotels.noRate}
        </Typography>
      )}
    </>
  );

  // Not a link: the card already is one, and a second anchor to the same place would be a
  // duplicate tab stop reading "Request quote" twenty times over. A Button drawn as a span,
  // out of the tab order and hidden from assistive tech; the stretched anchor sits above it.
  const quotePill = (extra?: { mt: string }) => (
    <MuiButton
      component="span"
      aria-hidden="true"
      tabIndex={-1}
      disableRipple
      variant="contained"
      size="small"
      sx={{ ...CARD_CTA_SX, ...extra }}
    >
      {RESULTS.card.quote}
    </MuiButton>
  );

  return (
    <>
      {/* Row layout — web (≥1200). */}
      <Card
        component="article"
        sx={{ position: "relative", display: { xs: "none", web: "grid" }, gridTemplateColumns: "180px 1fr auto" }}
      >
        <Box sx={{ position: "relative", minHeight: 120, bgcolor: "surface.3" }}>
          {hotel.photos[0] && (
            <Image
              src={hotel.photos[0]}
              alt=""
              fill
              sizes="180px"
              // Google's CDN sees a visitor's IP the moment this loads; sending our URL with
              // it as well is gratuitous. See the privacy page.
              referrerPolicy="no-referrer"
              style={{ objectFit: "cover" }}
            />
          )}
        </Box>
        <Box sx={{ minWidth: 0, px: 2, py: 1.75 }}>
          {overline && <Chip size="small" color="tertiary" label={overline} sx={TAG_SX} />}
          {/* THE WHOLE CARD IS THE LINK, via a stretched pseudo-element on this one anchor.
              A curated trip has a detail page AND a quote button, so its card carries two
              destinations; a hotel has exactly one, and making a 180px-tall row clickable
              only in its bottom-right corner was a worse target for no reason.

              The heading is what carries it, so a screen reader announces the hotel's name
              as the link rather than a generic "Request quote" repeated twenty times. The
              pill below is then decoration — see the span.

              `.link-stretch` stays as the hook: its ::after and its focus ring live in
              public.css's components layer, which an sx rule cannot override. Because the
              ::after is part of the anchor, hovering anywhere on the card is hovering the
              link, so MUI's own `underline="hover"` gives the old group-hover for free. */}
          <Typography component="h2" variant="h5" sx={{ mt: 0.75, mb: 0.25 }}>
            <MuiLink component={NextLink} href={quote} className="link-stretch" color="inherit" underline="hover">
              {hotel.name}
            </MuiLink>
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {sub}
          </Typography>
          {amenities.length > 0 && (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.75, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {amenities.map((a) => (
                <Chip key={a} component="li" size="small" variant="outlined" label={a} sx={{ color: "text.secondary" }} />
              ))}
            </Box>
          )}
        </Box>
        <Box sx={PRICE_COLUMN_SX}>
          {price("h5")}
          {quotePill({ mt: "auto" })}
        </Box>
      </Card>

      {/* Stacked layout — mobile and tablet. */}
      <Card component="article" sx={{ position: "relative", display: { web: "none" } }}>
        <Box sx={{ position: "relative", aspectRatio: "16 / 9", bgcolor: "surface.3" }}>
          {hotel.photos[0] && (
            <Image
              src={hotel.photos[0]}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              referrerPolicy="no-referrer"
              style={{ objectFit: "cover" }}
            />
          )}
          {overline && (
            <Chip size="small" color="tertiary" label={overline} sx={{ ...TAG_SX, position: "absolute", top: 8, left: 8 }} />
          )}
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            <MuiLink component={NextLink} href={quote} className="link-stretch" color="inherit" underline="hover">
              {hotel.name}
            </MuiLink>
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {sub}
          </Typography>
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box>{price("h6")}</Box>
            {quotePill()}
          </Box>
        </Box>
      </Card>
    </>
  );
}
