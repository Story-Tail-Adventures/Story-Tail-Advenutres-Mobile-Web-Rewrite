import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { COMMISSION_COPY } from "@/lib/agent/content";
import type { CommissionMonth } from "@/lib/agent/commission";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * §3.7.1's "Monthly trend · 12 months" card, as A371_CommissionDashboard draws it: twelve
 * flat-topped bars on `primary.main`, the current month on `brand.main`, a month label
 * under each, and the year-on-year chip top right.
 *
 * BOXES, NOT A CHART LIBRARY. The artboard is twelve rectangles; a charting package would be
 * a new dependency to draw what four sx properties already do, and it would want to measure
 * the DOM, which a Server Component cannot.
 *
 * THE BARS ARE DECORATION TO A SCREEN READER. They are `aria-hidden`, and a visually hidden
 * table carries the same twelve figures in reading order — a heading, then "June 2026,
 * $1,038". Each bar also has a `title`, so a mouse pointer gets the amount on hover without
 * any client code.
 */
export function CommissionTrendChart({
  months,
  anyReceived,
  trendChange,
}: {
  months: CommissionMonth[];
  anyReceived: boolean;
  trendChange: string | null;
}) {
  return (
    <Card>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, mb: 1.75 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
            {COMMISSION_COPY.trendTitle}
          </Typography>
          {trendChange && <Chip variant="outlined" size="small" label={trendChange} sx={{ ml: "auto" }} />}
        </Box>

        {!anyReceived && (
          <Typography component="p" variant="body2" sx={{ mb: 1.5, color: "text.secondary" }}>
            {COMMISSION_COPY.trendEmpty}
          </Typography>
        )}

        <Box aria-hidden="true" sx={BARS_SX}>
          {months.map((m) => (
            <Box key={m.monthStart} title={`${m.longLabel}: ${m.amountLabel}`} sx={COLUMN_SX}>
              <Box sx={BAR_AREA_SX}>
                <Box
                  sx={{
                    ...BAR_SX,
                    height: `${m.heightPct}%`,
                    bgcolor: m.isCurrent ? "brand.main" : "primary.main",
                  }}
                />
              </Box>
              <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                {m.label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box component="table" sx={VISUALLY_HIDDEN}>
          <caption>{COMMISSION_COPY.trendTableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{COMMISSION_COPY.trendMonth}</th>
              <th scope="col">{COMMISSION_COPY.trendAmount}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.monthStart}>
                <th scope="row">{m.longLabel}</th>
                <td>{m.amountLabel}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </CardContent>
    </Card>
  );
}

/** The artboard's 200px plot, twelve columns 10px apart, bars standing on the baseline. */
const BARS_SX = { height: 200, display: "flex", alignItems: "flex-end", gap: { xs: 0.5, sm: 1.25 } } as const;

/**
 * One month: the bar, then its label. `minWidth: 0` lets twelve columns share a phone-width
 * card; the label's caption size still fits "Sep" at 375px.
 */
const COLUMN_SX = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 0.5,
} as const;

/**
 * The space a bar stands in: whatever the column has left above its label. The bar's
 * percentage height resolves against THIS box, so the tallest bar plus its label never
 * overflows the 200px plot — which it did when the bar measured against the whole column.
 */
const BAR_AREA_SX = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
} as const;

/** 70% of the column, the artboard's 4px top radius, square at the baseline. */
const BAR_SX = { width: "70%", borderRadius: "4px 4px 0 0" } as const;
