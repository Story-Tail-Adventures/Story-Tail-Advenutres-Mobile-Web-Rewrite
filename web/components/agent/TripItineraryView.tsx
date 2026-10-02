import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import type { TripItineraryView as TripItinerary } from "@/lib/agent/tripDetail";

const BLOCK_LABEL: Record<string, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
  all_day: "ALL DAY",
};

/**
 * The read-only itinerary, drawn the way the artboard's itinerary editor (3.4.14) draws a
 * day: the script "Day N" in the primary colour, time blocks as overline in the brand
 * orange, and Gyasi's tip on a tertiary-container Paper.
 */
export function TripItineraryView({ itinerary }: { itinerary: TripItinerary }) {
  return (
    <div>
      <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
        <Chip size="small" variant="outlined" label={itinerary.publishedLabel} />
      </Box>

      {itinerary.days.length === 0 ? (
        <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
          {AGENT_COPY.tripItineraryEmpty}
        </Typography>
      ) : (
        itinerary.days.map((day) => (
          <Box key={day.dayId} sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography variant="script" sx={{ fontSize: 22, lineHeight: 1, color: "primary.main" }}>
                Day {day.dayNumber}
              </Typography>
              {day.label && (
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {day.label}
                </Typography>
              )}
              {day.dateLabel && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {day.dateLabel}
                </Typography>
              )}
            </Box>
            {day.summary && (
              <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
                {day.summary}
              </Typography>
            )}
            <Stack spacing={1} sx={{ mt: 1 }}>
              {day.activities.map((a) => (
                <Card key={a.activityId}>
                  <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {a.block && (
                        <Typography variant="overline" sx={{ color: "brand.main", lineHeight: 1.3 }}>
                          {BLOCK_LABEL[a.block] ?? a.block.toUpperCase()}
                        </Typography>
                      )}
                      <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
                        {a.timeLabel ? `${a.timeLabel} · ` : ""}
                        {a.title}
                      </Typography>
                    </Box>
                    {a.body && (
                      <Typography component="p" variant="body2" sx={{ mt: 0.5 }}>
                        {a.body}
                      </Typography>
                    )}
                    {a.gyasisTip && (
                      <Paper
                        elevation={0}
                        sx={{
                          mt: 1,
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1,
                          p: 1,
                          bgcolor: "tertiary.container",
                          color: "tertiary.onContainer",
                        }}
                      >
                        <Typography variant="overline" sx={{ flexShrink: 0, lineHeight: 1.3 }}>
                          GYASI&apos;S TIP
                        </Typography>
                        <Typography variant="body2">{a.gyasisTip}</Typography>
                      </Paper>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        ))
      )}
    </div>
  );
}
