import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface SectionLabelProps {
  overline?: string;
  title: string;
  sub?: string;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}

/**
 * The section title ramp: 18px on phones, 24px at tablet, 28px on web, as the legacy
 * `.t-section` drew it. The MUI artboards use stock `h4` (34px) at 1440; the smaller web
 * step is kept so nothing below a title moves. Delete `fontSize` here to take the artboard's.
 */
const SECTION_TITLE = {
  fontWeight: 700,
  fontSize: { xs: 18, md: 24, web: 28 },
  lineHeight: { xs: 1.2, md: 1.15 },
  letterSpacing: { xs: "-0.2px", web: "-0.4px" },
} as const;

/** Overline + section heading + optional sub (design: SectionLabel in the topic pages). */
export function SectionLabel({ overline, title, sub, as: Heading = "h2", id, className }: SectionLabelProps) {
  return (
    <Box className={className} sx={{ mb: { xs: 1.25, md: 2 } }}>
      {overline && (
        <Typography
          component="p"
          variant="overline"
          sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 }}
        >
          {overline}
        </Typography>
      )}
      <Typography component={Heading} id={id} variant="h4" sx={{ ...SECTION_TITLE, mt: 0.25, mb: 0.5, color: "text.primary" }}>
        {title}
      </Typography>
      {sub && (
        <Typography component="p" variant="body2" sx={{ maxWidth: 720, color: "text.secondary" }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
