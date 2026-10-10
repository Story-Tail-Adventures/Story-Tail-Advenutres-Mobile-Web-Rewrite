import MuiButton from "@mui/material/Button";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { Trip } from "@/content/public/types";
import { formatMoney } from "@/lib/public/money";
import { UP_LG, UP_MD } from "@/lib/mui/sx";
import { DETAIL } from "./content";

interface PriceCardProps {
  trip: Trip;
  quoteHref: string;
  saveHref: string;
  /** Guest inquiry (mailto or the gate) — rendered as a plain <a>. */
  messageHref: string;
  className?: string;
}

/**
 * The two CTAs: full width in a column, except at tablet where the card runs full width
 * under the hero and they sit side by side (the rail returns at `lg`).
 */
const CTA = { minHeight: 40, [UP_MD]: { flex: 1 }, [UP_LG]: { flex: "none" } } as const;

/**
 * Price + CTAs card in the 2.0.5 aside (design C205). Full-width under the hero on tablet with
 * the two buttons side by side; a column in the right rail from 1024. Below `md` the page's
 * StickyCta carries the price instead, so callers hide this.
 */
export function PriceCard({ trip, quoteHref, saveHref, messageHref, className }: PriceCardProps) {
  return (
    <Card className={className}>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
          {DETAIL.price.startingAt}
        </Typography>
        <Typography variant="h3" component="p" sx={{ my: 0.5, fontWeight: 700, color: "text.primary" }}>
          {formatMoney(trip.from, { whole: true })}
          <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
            {" "}
            {DETAIL.price.perPerson}
          </Typography>
        </Typography>
        <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
          {trip.priceNote}
        </Typography>

        <Box
          sx={{
            mt: 1.75,
            display: "flex",
            flexDirection: { xs: "column", md: "row", lg: "column" },
            gap: 1,
          }}
        >
          <MuiButton component={NextLink} href={quoteHref} variant="contained" fullWidth sx={CTA}>
            {DETAIL.price.requestQuote}
          </MuiButton>
          <MuiButton
            component={NextLink}
            href={saveHref}
            variant="outlined"
            color="secondary"
            fullWidth
            startIcon={<Icon name="heart" size={14} />}
            sx={CTA}
          >
            {DETAIL.price.favorite}
          </MuiButton>
        </Box>

        <Typography variant="caption" component="p" sx={{ mt: 1.25, textAlign: "center", color: "text.secondary" }}>
          {DETAIL.price.orNote}
        </Typography>
        <MuiButton component="a" href={messageHref} variant="text" size="small" fullWidth sx={{ mt: 0.5, minHeight: 32 }}>
          {DETAIL.price.messageGuest}
        </MuiButton>
      </CardContent>
    </Card>
  );
}
