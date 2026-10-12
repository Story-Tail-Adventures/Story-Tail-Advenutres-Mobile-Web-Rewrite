import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

import { FORECAST_COPY } from "@/lib/agent/content";
import type { CashInRowView } from "@/lib/agent/forecast";

/**
 * A377_Forecast's right card: one row per month — the month, a bar against the biggest row,
 * the amount — as the artboard draws it, for twelve months rather than its six.
 *
 * Overdue sits first and Later / Date not set last, each only when it holds money, so the
 * rows add up to the forecast less what has already arrived (the note under them says how
 * much, when there is any). A list, not a table: each row reads as one sentence.
 */
export function CashInCalendar({
  rows,
  receivedNote,
}: {
  rows: CashInRowView[];
  receivedNote: string | null;
}) {
  return (
    <Card>
      <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
        <Typography component="h2" variant="subtitle1" sx={{ m: 0, fontWeight: 600 }}>
          {FORECAST_COPY.calendarTitle}
        </Typography>
        <Box component="ul" aria-label={FORECAST_COPY.calendarLabel} sx={{ listStyle: "none", m: 0, mt: 0.5, p: 0 }}>
          {rows.map((r) => (
            <Box
              component="li"
              key={r.key}
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 88px) minmax(0, 1fr) minmax(0, 88px)",
                alignItems: "center",
                columnGap: 1.25,
                py: 1,
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Typography
                component="span"
                variant="subtitle2"
                sx={{ color: r.kind === "overdue" ? "warning.main" : "text.primary" }}
              >
                {r.label}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={r.barPct}
                aria-hidden
                sx={{ height: 8, borderRadius: 4, bgcolor: "surface.3" }}
              />
              <Typography
                component="span"
                variant="body2"
                sx={{ fontFamily: "mono", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}
              >
                {r.amountLabel}
              </Typography>
            </Box>
          ))}
        </Box>
        {receivedNote && (
          <Typography component="p" variant="caption" sx={{ display: "block", mt: 1.25, color: "text.secondary" }}>
            {receivedNote}
          </Typography>
        )}
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.5, color: "text.secondary" }}>
          {FORECAST_COPY.noTermsNote}
        </Typography>
      </CardContent>
    </Card>
  );
}
