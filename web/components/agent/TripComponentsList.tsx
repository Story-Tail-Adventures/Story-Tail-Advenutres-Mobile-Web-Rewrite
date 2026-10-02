import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY } from "@/lib/agent/content";
import type { TripComponentRow } from "@/lib/agent/tripDetail";

/**
 * The artboard's compact row card (`A34_MuiRowCard` + `A34_MuiIconTile` in agent-trip.jsx):
 * a tinted square icon tile, title over meta, the source as a small mono chip, the cost
 * right-aligned in the mono face.
 */
const ROW_SX = {
  py: 1.25,
  px: 1.75,
  display: "flex",
  gap: 1.5,
  alignItems: "center",
  "&:last-child": { pb: 1.25 },
} as const;

export function TripComponentsList({ components }: { components: TripComponentRow[] }) {
  if (components.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {AGENT_COPY.tripComponentsEmpty}
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75}>
      {components.map((c) => (
        <Card key={c.componentId}>
          <CardContent sx={ROW_SX}>
            <Avatar
              variant="rounded"
              sx={{ width: 32, height: 32, bgcolor: "secondary.container", color: "secondary.onContainer" }}
            >
              <Icon name={c.icon} size={16} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {c.title}
              </Typography>
              {c.subtitle && (
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                  {c.subtitle}
                </Typography>
              )}
            </Box>
            <Chip
              size="small"
              variant="outlined"
              label={c.sourceBadge}
              sx={{ fontFamily: "mono", fontSize: 11, height: 20 }}
            />
            <Typography
              variant="body2"
              sx={{ fontFamily: "mono", fontWeight: 700, fontSize: 12, minWidth: 70, textAlign: "right" }}
            >
              {c.costLabel}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
