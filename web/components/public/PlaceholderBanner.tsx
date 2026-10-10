import Typography from "@mui/material/Typography";
import { hasPlaceholders, PLACEHOLDER_BANNER, placeholderReport } from "@/content/public/proof";

/**
 * Shown on every public page while any marketing claim, testimonial, photo, price or
 * legal page is still a placeholder (web/content/public/proof.ts). Disappears on its own
 * as content is verified; a strict production build refuses to compile until it would.
 *
 * `.placeholder-banner` stays as the hook the print rule in styles/public.css hides.
 */
export function PlaceholderBanner() {
  const report = placeholderReport();
  if (!hasPlaceholders(report)) return null;
  return (
    <Typography
      component="div"
      role="note"
      variant="body2"
      className="placeholder-banner"
      sx={{ bgcolor: "warning.container", color: "text.primary", px: 2, py: 1, textAlign: "center" }}
    >
      {PLACEHOLDER_BANNER}
    </Typography>
  );
}
