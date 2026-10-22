import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { BUILT_REPORTS, reportHref } from "@/lib/agent/reportsView";
import { REPORTS_COPY, REPORT_TILES } from "@/lib/agent/reportsCopy";

/**
 * Screen 3.11.1 — Reports Hub (P1). §4.4 Pattern D variant: a tile grid.
 *
 * SEVEN TILES, NO FAVORITES OR RECENT (§3.11, ruled 2026-10-21). The artboard stars two tiles
 * under "Favorites & recent"; one advisor and seven tiles do not need a table to star them.
 * Its "Time-to-book" tile has no screen of its own: average days to book is on the Funnel.
 *
 * A tile whose report lands in a later PR of this section shows "On its way" in visible text
 * and is not a link (§3.2.1's rule for a disabled control: the reason is on the screen, not in
 * a hover title a touch screen never sees).
 */

export const metadata = { title: "Reports" };

export default function ReportsHubPage() {
  return (
    <Box sx={PAGE_SX}>
      <Box component="header" sx={{ mt: 1, mb: 2.5 }}>
        <Typography component="h1" variant="h5" sx={{ m: 0 }}>
          {REPORTS_COPY.hubTitle}
        </Typography>
        <Typography component="p" variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          {REPORTS_COPY.hubSubtitle}
        </Typography>
      </Box>

      <Box component="ul" sx={GRID_SX}>
        {REPORT_TILES.map((t) => {
          const built = BUILT_REPORTS.includes(t.id);
          const body = (
            <>
              <Box aria-hidden="true" sx={ICON_SX}>
                <Icon name={t.icon} size={18} />
              </Box>
              <Typography component="h2" variant="subtitle1" sx={{ mt: 1.25, lineHeight: 1.3 }}>
                {t.title}
              </Typography>
              <Typography component="p" variant="caption" sx={{ mt: 0.25, display: "block", color: "text.secondary" }}>
                {t.sub}
              </Typography>
              {!built && (
                <Typography component="p" variant="caption" sx={{ mt: 1, display: "block", fontWeight: 600, color: "text.secondary" }}>
                  {REPORTS_COPY.tileSoon}
                </Typography>
              )}
            </>
          );
          return (
            <Box component="li" key={t.id} sx={{ listStyle: "none", minWidth: 0 }}>
              <Card variant="outlined" sx={{ height: "100%", ...(built ? {} : { bgcolor: "surface.1" }) }}>
                {built ? (
                  <CardActionArea component={NextLink} href={reportHref(t.id)} sx={TILE_SX}>
                    {body}
                  </CardActionArea>
                ) : (
                  <Box sx={TILE_SX}>{body}</Box>
                )}
              </Card>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const PAGE_SX = { mx: "auto", width: "100%", maxWidth: 1336, px: { xs: 2, md: 4 }, py: 3 } as const;

/** One column on a phone, two on a tablet, the artboard's four across on the web. */
const GRID_SX = {
  m: 0,
  p: 0,
  display: "grid",
  gap: 1.5,
  gridTemplateColumns: {
    xs: "minmax(0, 1fr)",
    sm: "repeat(2, minmax(0, 1fr))",
    web: "repeat(4, minmax(0, 1fr))",
  },
} as const;

const TILE_SX = {
  p: 2,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "flex-start",
} as const;

/** The artboard's 38px rounded square on the secondary container. */
const ICON_SX = {
  width: 38,
  height: 38,
  borderRadius: 1,
  bgcolor: "secondary.container",
  color: "secondary.onContainer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
} as const;
