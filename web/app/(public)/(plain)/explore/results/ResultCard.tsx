import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import type { Trip } from "@/content/public/types";
import { TAP_TARGET } from "@/lib/mui/sx";
import { joinHref, quoteKindFor, requestQuoteHref, tripHref } from "@/lib/public/links";
import { formatMoney } from "@/lib/public/money";
import { RESULTS } from "./content";

interface ResultCardProps {
  trip: Trip;
  /** Third-party rating from the claims registry, when one exists. */
  rating?: number;
  /** The current results URL, so the gate can return here. */
  next: string;
}

/** The C204 overline tag: a small tertiary Chip in 9.5px caps, 20px tall. */
export const TAG_SX = {
  textTransform: "uppercase",
  fontWeight: 600,
  fontSize: 9.5,
  letterSpacing: 0.4,
  height: 20,
} as const;

/** The row's right-hand column: 170px minimum, a left rule, right-aligned, actions at the foot. */
export const PRICE_COLUMN_SX = {
  display: "flex",
  minWidth: 170,
  flexDirection: "column",
  alignItems: "flex-end",
  borderLeft: 1,
  borderColor: "divider",
  px: 2,
  py: 1.75,
  textAlign: "right",
} as const;

/** The small contained CTA every card ends with (the legacy .btn-filled.btn-sm box). */
export const CARD_CTA_SX = { minHeight: 32, px: "16px", whiteSpace: "nowrap" } as const;

/**
 * One search result (design C204 row: 180px photo | body | price column; M204 stacked card
 * below `web`). The name links to the detail page; "Request quote" and "Save" go to the
 * sign-up gate with the trip and the return path.
 *
 * On MUI: the row is a Card laid out as the artboard's `180px 1fr auto` grid, the tag a small
 * tertiary Chip, the title an h5 holding the link, the price column overline / h5 / caption.
 * Hovering anywhere on the card underlines the name, as the old `group-hover` did.
 */
export function ResultCard({ trip, rating, next }: ResultCardProps) {
  const detail = tripHref(trip.slug);
  const quote = requestQuoteHref({
    ...quoteKindFor(trip.type),
    slug: trip.slug,
    name: trip.name,
    source: "curated",
  });
  const save = joinHref({ intent: "save", trip: trip.slug, next });
  const price = formatMoney(trip.from, { whole: true });

  const sub = (
    <>
      {trip.tagline}
      {rating !== undefined && (
        <>
          {" · "}
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, verticalAlign: "baseline" }}>
            <Box component="span" sx={{ display: "inline-flex", color: "brandSource.sunset" }}>
              <Icon name="star" size={11} filled />
            </Box>
            {rating}
          </Box>
        </>
      )}
    </>
  );

  return (
    <>
      {/* Row layout — web (≥1200). */}
      <Card
        component="article"
        sx={{
          display: { xs: "none", web: "grid" },
          gridTemplateColumns: "180px 1fr auto",
          "&:hover h2 a": { textDecoration: "underline" },
        }}
      >
        <Box sx={{ position: "relative", minHeight: 120, "& img": { objectFit: "cover" } }}>
          <Photo image={trip.imageKey} fill sizes="180px" alt="" />
        </Box>
        <Box sx={{ minWidth: 0, px: 2, py: 1.75 }}>
          <Chip size="small" color="tertiary" label={trip.overline} sx={TAG_SX} />
          <Typography component="h2" variant="h5" sx={{ mt: 0.75, mb: 0.25 }}>
            <MuiLink component={NextLink} href={detail} color="inherit" underline="hover">
              {trip.name}
            </MuiLink>
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {sub}
          </Typography>
        </Box>
        <Box sx={PRICE_COLUMN_SX}>
          <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
            {RESULTS.card.from}
          </Typography>
          <Typography component="p" variant="h5" sx={{ my: 0.25 }}>
            {price}
            <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
              {" "}
              {RESULTS.card.perPerson}
            </Typography>
          </Typography>
          <MuiButton component={NextLink} href={quote} variant="contained" size="small" sx={{ ...CARD_CTA_SX, mt: "auto" }}>
            {RESULTS.card.quote}
          </MuiButton>
          <MuiButton
            component={NextLink}
            href={save}
            variant="text"
            size="small"
            sx={{ mt: 0.5, minHeight: 32, minWidth: 0, px: 0, gap: 1, whiteSpace: "nowrap" }}
          >
            <Icon name="heart" size={11} />
            {RESULTS.card.save}
          </MuiButton>
        </Box>
      </Card>

      {/* Stacked layout — mobile and tablet. */}
      <Card component="article" sx={{ display: { web: "none" } }}>
        <Box sx={{ position: "relative", aspectRatio: "16 / 9", "& img": { objectFit: "cover" } }}>
          <Photo image={trip.imageKey} fill sizes="(min-width: 768px) 50vw, 100vw" alt="" />
          <Chip size="small" color="tertiary" label={trip.overline} sx={{ ...TAG_SX, position: "absolute", top: 8, left: 8 }} />
          {/* The wrapper is what is positioned: TAP_TARGET sets `position: relative` on its host
              under a coarse pointer, which would pull an absolutely positioned button out of
              the corner. */}
          <Box sx={{ position: "absolute", top: 8, right: 8 }}>
            <IconButton
              component={NextLink}
              href={save}
              aria-label={RESULTS.card.saveAria(trip.name)}
              size="small"
              sx={{
                ...TAP_TARGET,
                width: 32,
                height: 32,
                bgcolor: "common.white",
                color: "brandSource.navy",
                "&:hover": { bgcolor: "common.white" },
              }}
            >
              <Icon name="heart" size={14} />
            </IconButton>
          </Box>
        </Box>
        <Box sx={{ p: 1.5 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            <MuiLink component={NextLink} href={detail} color="inherit" underline="hover">
              {trip.name}
            </MuiLink>
          </Typography>
          <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            {sub}
          </Typography>
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box>
              <Typography component="span" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
                {RESULTS.card.from}
              </Typography>
              <Typography component="div" variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {price}
                <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                  {" "}
                  {RESULTS.card.perPerson}
                </Typography>
              </Typography>
            </Box>
            <MuiButton component={NextLink} href={quote} variant="contained" size="small" sx={CARD_CTA_SX}>
              {RESULTS.card.quote}
            </MuiButton>
          </Box>
        </Box>
      </Card>
    </>
  );
}
