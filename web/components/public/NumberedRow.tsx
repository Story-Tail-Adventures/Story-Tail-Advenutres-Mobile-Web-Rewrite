import MuiAvatar from "@mui/material/Avatar";
import MuiCard from "@mui/material/Card";
import Typography from "@mui/material/Typography";

/**
 * One day of a sample itinerary (design: 2.0.5 — a Card row with a numbered Avatar on the
 * secondary container). Render inside an <ol>. The badge is 22px below `md` and 28px from it,
 * as the legacy row drew it.
 */
export function NumberedRow({ n, label }: { n: number; label: string }) {
  return (
    <MuiCard
      component="li"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 1.25, md: 1.5 },
        px: { xs: 1.5, md: 1.75 },
        py: { xs: 1, md: 1.25 },
      }}
    >
      <MuiAvatar
        aria-hidden="true"
        sx={{
          width: { xs: 22, md: 28 },
          height: { xs: 22, md: 28 },
          fontSize: 11,
          fontWeight: 700,
          bgcolor: "secondary.container",
          color: "secondary.onContainer",
        }}
      >
        {n}
      </MuiAvatar>
      <Typography variant="body2" sx={{ color: "text.primary" }}>
        {label}
      </Typography>
    </MuiCard>
  );
}
