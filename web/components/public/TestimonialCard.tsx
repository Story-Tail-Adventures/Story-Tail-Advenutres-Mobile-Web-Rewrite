import Box from "@mui/material/Box";
import MuiCard from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import type { Testimonial } from "@/content/public/types";
import { Avatar } from "./Avatar";

/**
 * A quote card (design: C2011 / M2011 testimonials — a Card with the script quote glyph in
 * brand orange, the quote, a rule, then the monogram). Renders an initials avatar rather
 * than a stock face; the registry keeps every quote `consented: false` until a real,
 * permissioned testimonial replaces it. Stays a <figure> with a <blockquote> and
 * <figcaption>, which is what the About page test counts.
 */
export function TestimonialCard({ testimonial, className }: { testimonial: Testimonial; className?: string }) {
  return (
    <MuiCard
      component="figure"
      className={className}
      sx={{ display: "flex", flexDirection: "column", m: 0, p: { xs: 1.75, md: 2.25 } }}
    >
      <Typography
        component="span"
        aria-hidden="true"
        variant="script"
        sx={{ fontSize: { xs: 24, md: 32 }, lineHeight: { xs: 0.5, md: 0.7 }, letterSpacing: -2, color: "brand.main" }}
      >
        “
      </Typography>
      <Typography
        component="blockquote"
        variant="body2"
        sx={{ mt: 0.5, mx: 0, mb: 0, flex: 1, textWrap: "pretty", color: "text.primary" }}
      >
        {testimonial.quote}
      </Typography>
      <Box
        component="figcaption"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          mt: { xs: 1.5, md: 1.75 },
          pt: { xs: 1.5, md: 1.75 },
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Avatar initials={testimonial.initials} size={30} />
        <Box>
          <Typography component="div" variant="subtitle2" sx={{ lineHeight: 1.2, color: "text.primary" }}>
            {testimonial.who}
          </Typography>
          <Typography component="div" variant="caption" sx={{ color: "text.secondary" }}>
            {testimonial.trip}
          </Typography>
        </Box>
      </Box>
    </MuiCard>
  );
}
