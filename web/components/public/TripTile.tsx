import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import MuiCard from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { Topic, Trip } from "@/content/public/types";
import { joinHref, tripHref } from "@/lib/public/links";
import { Photo } from "./Photo";
import { PriceRange } from "./PriceRange";
import { TAP_TARGET } from "@/lib/mui/sx";

interface TripTileProps {
  trip: Trip;
  /** Apply this topic page's placement overrides (tagline, overline, badge). */
  topic?: Topic;
  /** `card` from `md` and `row` below it, unless forced. */
  layout?: "card" | "row" | "responsive";
  /** Path to return to after sign-up (the page this tile is on). */
  next: string;
  className?: string;
}

/** The badge chip over the photo (design: TripTile — a small secondary Chip, uppercase). */
const BADGE = {
  position: "absolute",
  fontWeight: 700,
  textTransform: "uppercase",
} as const;

/** The brand overline every tile opens with. */
const OVERLINE = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The legacy `.btn-sm` box on MUI's small button. */
const SMALL = { minHeight: 32, px: 2, whiteSpace: "nowrap" } as const;

/**
 * §4.2's touch minimum, as the legacy `tap-44`: MTripTile draws a 32px small button, so the
 * TAP AREA grows to 44px on coarse pointers and the visible controls stay 32px.
 */
const TAP = TAP_TARGET;

/**
 * Curated trip tile (design: TripTile = card, MTripTile = mobile row). The title links to the
 * detail page; "Request quote" and the heart go to the sign-up gate with context.
 */
export function TripTile({ trip, topic, layout = "responsive", next, className }: TripTileProps) {
  const placement = topic ? trip.topics[topic] : undefined;
  const overline = placement?.overline ?? trip.overline;
  const tagline = placement?.tagline ?? trip.tagline;
  const badge = placement?.badge ?? trip.badge;
  const detail = tripHref(trip.slug);
  const quote = joinHref({ intent: "quote", trip: trip.slug, next });
  const save = joinHref({ intent: "save", trip: trip.slug, next });
  const saveLabel = `Save ${trip.name} for later`;

  const card = (
    <MuiCard
      component="article"
      className={className}
      sx={{
        position: "relative",
        display: layout === "responsive" ? { xs: "none", md: "flex" } : "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box sx={{ position: "relative", aspectRatio: "5 / 3" }}>
        <Photo image={trip.imageKey} fill sizes="(min-width: 1200px) 400px, 50vw" alt="" />
        {badge && (
          <Chip
            size="small"
            color="secondary"
            label={badge}
            sx={{ ...BADGE, top: 10, left: 10, height: 20, fontSize: 9.5, letterSpacing: 0.5 }}
          />
        )}
        <Box component="span" sx={{ position: "absolute", top: 10, right: 10 }}>
          <PriceRange band={trip.band} />
        </Box>
      </Box>
      <CardContent sx={{ p: 1.75, flex: 1, display: "flex", flexDirection: "column", "&:last-child": { pb: 1.75 } }}>
        <Typography component="p" variant="overline" sx={OVERLINE}>
          {overline}
        </Typography>
        <Typography component="h3" variant="subtitle1" sx={{ mt: 0.25, color: "text.primary" }}>
          <MuiLink component={NextLink} href={detail} underline="hover" color="inherit">
            {trip.name}
          </MuiLink>
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {tagline}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: "auto", pt: 1.25, alignItems: "center" }}>
          <MuiButton component={NextLink} href={quote} variant="contained" size="small" sx={{ ...SMALL, flex: 1 }}>
            Request quote
          </MuiButton>
          <IconButton component={NextLink} href={save} size="small" aria-label={saveLabel} sx={{ width: 32, height: 32 }}>
            <Icon name="heart" size={14} />
          </IconButton>
        </Stack>
      </CardContent>
    </MuiCard>
  );

  const row = (
    <MuiCard
      component="article"
      className={className}
      sx={{ display: layout === "responsive" ? { xs: "flex", md: "none" } : "flex", overflow: "hidden" }}
    >
      <Box sx={{ position: "relative", width: 120, flexShrink: 0 }}>
        <Photo image={trip.imageKey} fill sizes="120px" alt="" />
        {badge && (
          <Chip
            size="small"
            color="secondary"
            label={badge}
            sx={{ ...BADGE, top: 6, left: 6, height: 18, fontSize: 8.5, letterSpacing: 0.4, "& .MuiChip-label": { px: 0.75 } }}
          />
        )}
      </Box>
      <Box sx={{ display: "flex", flex: 1, flexDirection: "column", p: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 0.75 }}>
          <Typography component="p" variant="overline" sx={OVERLINE}>
            {overline}
          </Typography>
          <PriceRange band={trip.band} size="sm" />
        </Box>
        <Typography component="h3" variant="subtitle2" sx={{ mt: 0.25, color: "text.primary" }}>
          <MuiLink component={NextLink} href={detail} underline="hover" color="inherit">
            {trip.name}
          </MuiLink>
        </Typography>
        <Typography component="p" variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
          {tagline}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: "auto", pt: 1, alignItems: "center" }}>
          <MuiButton component={NextLink} href={quote} variant="contained" size="small" sx={{ ...SMALL, ...TAP }}>
            Request quote
          </MuiButton>
          <IconButton
            component={NextLink}
            href={save}
            size="small"
            aria-label={saveLabel}
            sx={{ width: 32, height: 32, ...TAP }}
          >
            <Icon name="heart" size={14} />
          </IconButton>
        </Stack>
      </Box>
    </MuiCard>
  );

  if (layout === "card") return card;
  if (layout === "row") return row;
  return (
    <>
      {card}
      {row}
    </>
  );
}
