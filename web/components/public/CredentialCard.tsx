import MuiAvatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiCard from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { Icon } from "@/components/ui/Icon";

/**
 * One credential row (design: C2011 / M2011 credentials). Values come from the claims
 * registry. From `md` the shield sits in a rounded Avatar on the secondary container and
 * the detail line shows; below it the row is a bare 14px glyph and the title alone.
 */
export function CredentialCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <MuiCard
      component="li"
      sx={{
        display: "flex",
        alignItems: { xs: "center", md: "flex-start" },
        gap: { xs: 1.25, md: 1.5 },
        px: 1.75,
        py: { xs: 1.25, md: 1.75 },
      }}
    >
      <MuiAvatar
        variant="rounded"
        aria-hidden="true"
        sx={{
          display: { xs: "none", md: "flex" },
          width: 36,
          height: 36,
          flexShrink: 0,
          bgcolor: "secondary.container",
          color: "secondary.onContainer",
        }}
      >
        <Icon name="shield" size={16} />
      </MuiAvatar>
      <Box
        component="span"
        sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0, color: "secondary.main" }}
      >
        <Icon name="shield" size={14} />
      </Box>
      <Box>
        <Typography component="p" variant="subtitle1" sx={{ color: "text.primary" }}>
          {title}
        </Typography>
        {detail && (
          <Typography
            component="p"
            variant="caption"
            sx={{ display: { xs: "none", md: "block" }, color: "text.secondary" }}
          >
            {detail}
          </Typography>
        )}
      </Box>
    </MuiCard>
  );
}
