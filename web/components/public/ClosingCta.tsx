import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Photo } from "./Photo";

interface ClosingCtaProps {
  image: ImageKey;
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  className?: string;
}

/** The legacy `.btn-lg` box on MUI's large button, so the band keeps its height. */
const LARGE = { minHeight: 48, px: 3.5, whiteSpace: "nowrap" } as const;

/**
 * The on-photo "glass" button (design: ClosingCTA secondary). Its colours are the on-photo
 * set from styles/public.css (`--hero-glass-*`, white at fixed alphas, scheme-independent),
 * which is the one place a translucent white has a name.
 */
const GLASS = {
  color: "common.white",
  bgcolor: "var(--hero-glass-bg)",
  borderColor: "var(--hero-glass-border)",
  backdropFilter: "blur(6px)",
  "&:hover": { bgcolor: "var(--hero-glass-bg-hover)", borderColor: "var(--hero-glass-border)" },
} as const;

/**
 * Photo band with two CTAs at the end of the topic and advisor pages (design: ClosingCTA —
 * a Paper over the photo, the brand-orange contained button and a glass outlined one).
 * `.on-photo` stays as the hook for the on-photo focus ring; `.scrim-cta` is the
 * burgundy-to-navy brand gradient from styles/public.css.
 */
export function ClosingCta({ image, title, body, primary, secondary, className }: ClosingCtaProps) {
  return (
    <Paper
      component="section"
      elevation={0}
      className={cn("on-photo", className)}
      sx={{ position: "relative", mt: 1.5, minHeight: 220, overflow: "hidden" }}
    >
      <Photo image={image} fill sizes="(min-width: 1200px) 1280px, 100vw" alt="" />
      <Box aria-hidden="true" className="scrim-cta" sx={{ position: "absolute", inset: 0 }} />
      <Box
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          flexWrap: { md: "wrap" },
          alignItems: { md: "center" },
          justifyContent: { md: "space-between" },
          gap: { xs: 2.5, md: 3 },
          px: { xs: 2.5, md: 4.5 },
          py: { xs: 2.5, md: 4 },
          color: "common.white",
        }}
      >
        <Box sx={{ maxWidth: 540 }}>
          <Typography
            component="h2"
            variant="h4"
            sx={{
              fontWeight: { xs: 800, md: 700 },
              fontSize: { xs: 24, md: 26, web: 28 },
              lineHeight: { xs: 1.18, md: 1.15 },
              letterSpacing: { xs: "-0.3px", web: "-0.4px" },
              color: "common.white",
            }}
          >
            {title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "common.white", opacity: 0.9 }}>
            {body}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
          <MuiButton component={NextLink} href={primary.href} variant="contained" color="brand" size="large" sx={LARGE}>
            {primary.label}
          </MuiButton>
          <MuiButton component="a" href={secondary.href} variant="outlined" size="large" sx={{ ...LARGE, ...GLASS }}>
            {secondary.label}
          </MuiButton>
        </Stack>
      </Box>
    </Paper>
  );
}
