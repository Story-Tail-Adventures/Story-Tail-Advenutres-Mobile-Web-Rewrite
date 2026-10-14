import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";

/**
 * One KPI tile — §3.2.1's strip and §3.7.1's, drawn once.
 *
 * Lifted out of the worklist page when §3.7.1 needed the same tile: the prototype draws both
 * strips with the same Card (A321's and A371's `minHeight: 96` container cards), and two
 * hand-kept copies of the 26px amount and its breakpoint arithmetic would drift.
 *
 * `href` makes the whole tile a link — Screen Inventory §3.7.1's "drill into any metric", and
 * the worklist's commission tile into §3.7.1 itself. The CardActionArea carries the focus
 * ring and the hover wash; the tile's text is the link's accessible name, so a screen reader
 * hears "Commission expected, $11,101, 84% confidence" and not "link".
 *
 * A Server Component: `component={NextLink}` is a client reference and crosses the boundary.
 */

export type KpiTileData = {
  id: string;
  label: string;
  /** Pre-formatted. Null when there is nothing to report — `unavailable` renders instead. */
  value: string | null;
  /** The second line. Null when it is not computable; never a fabricated delta. */
  sub: string | null;
  /** Non-null when the tile has no value and owes an explanation. */
  unavailable: string | null;
  accent: "primary" | "secondary" | "tertiary" | "surface";
  icon: IconName;
  href?: string | null;
};

/** The tile's colour pair per accent — the M3 container roles, or the neutral surface. */
const KPI_TONE: Record<KpiTileData["accent"], { bgcolor: string; color: string }> = {
  primary: { bgcolor: "primary.container", color: "primary.onContainer" },
  secondary: { bgcolor: "secondary.container", color: "secondary.onContainer" },
  tertiary: { bgcolor: "tertiary.container", color: "tertiary.onContainer" },
  surface: { bgcolor: "surface.2", color: "text.primary" },
};

export function KpiTile({ kpi }: { kpi: KpiTileData }) {
  const body = (
    <CardContent sx={KPI_PAD_SX}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography component="span" variant="caption" sx={KPI_LABEL_SX}>
          {kpi.label}
        </Typography>
        <Icon name={kpi.icon} size={14} />
      </Box>
      {/* Null is not zero. A tile with nothing to report says so. */}
      {kpi.value === null ? (
        <Typography component="p" variant="body2" sx={{ mt: 1, opacity: 0.85 }}>
          {kpi.unavailable}
        </Typography>
      ) : (
        <>
          <Typography component="div" variant="h4" sx={KPI_VALUE_SX}>
            {kpi.value}
          </Typography>
          {kpi.sub && (
            <Typography component="div" variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.85 }}>
              {kpi.sub}
            </Typography>
          )}
        </>
      )}
    </CardContent>
  );

  return (
    <Card sx={{ ...KPI_TONE[kpi.accent], ...KPI_TILE_SX }}>
      {kpi.href ? (
        <CardActionArea component={NextLink} href={kpi.href} sx={{ height: "100%" }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}

/**
 * A tile: 152px wide as a carousel card, free to shrink once it is a grid cell. Deliberately
 * NO `overflow: hidden` beyond the Card's own: clipping an amount turns "$1,284,500" into
 * "$1,284,50", which reads as a real number and is wrong; each page's rail breakpoints are
 * the fix.
 */
const KPI_TILE_SX = { minWidth: { xs: 152, md: 0 }, flexShrink: 0, scrollSnapAlign: "start" } as const;

/** The legacy 14px × 16px tile padding on CardContent, with MUI's last-child rule cancelled. */
const KPI_PAD_SX = { px: 2, py: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** `.t-label` on MUI's caption, dimmed into the tile's colour. */
const KPI_LABEL_SX = { fontWeight: 500, letterSpacing: "0.4px", opacity: 0.85 } as const;

/**
 * The amount. 26px is pinned on purpose: it is the figure the worklist rail's breakpoint
 * arithmetic is computed from, not a leftover from the legacy type scale.
 */
const KPI_VALUE_SX = { mt: 0.5, fontSize: 26, fontWeight: 800, lineHeight: 1 } as const;
