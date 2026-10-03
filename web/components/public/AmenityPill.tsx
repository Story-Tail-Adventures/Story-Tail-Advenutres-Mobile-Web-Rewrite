import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { Icon, type IconName } from "@/components/ui/Icon";

/** Icon + short label on a tonal surface (design: 2.0.5 amenity grid — Paper on surface.2). */
export function AmenityPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Paper
      component="li"
      elevation={0}
      sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.25, bgcolor: "surface.2" }}
    >
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0, color: "brand.main" }}>
        <Icon name={icon} size={16} />
      </Box>
      <Typography variant="caption" sx={{ color: "text.primary" }}>
        {label}
      </Typography>
    </Paper>
  );
}
