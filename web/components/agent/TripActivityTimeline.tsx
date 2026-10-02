import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import type { TripActivityRow } from "@/lib/agent/tripDetail";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

function statusLabel(status: string): string {
  return tripStatusPresentation({
    status: status as TripStatus,
    nextUnpaidDueDate: null,
    today: "",
  }).label;
}

/**
 * The business timeline (`trip_status_history`), not the forensic audit trail. See
 * `agent_trip_activity`'s doc comment for why the two are kept apart.
 */
export function TripActivityTimeline({ activity }: { activity: TripActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {AGENT_COPY.tripActivityEmpty}
      </Typography>
    );
  }

  return (
    <Stack component="ol" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
      {activity.map((h) => (
        <Card component="li" key={h.historyId}>
          <CardContent sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box
              aria-hidden="true"
              sx={{ width: 8, flexShrink: 0, alignSelf: "stretch", borderRadius: 999, bgcolor: "primary.container" }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {h.fromLabel ? `${statusLabel(h.fromLabel)} → ${statusLabel(h.toLabel)}` : statusLabel(h.toLabel)}
              </Typography>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                {h.changedByName}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {h.changedAtLabel}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
