import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { NOT_FOUND } from "./fallback-content";

const OVERLINE = { display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3 } as const;

/** The page title's 28 / 32 / 36 ramp on MUI's h4. */
const TITLE = { fontWeight: 700, fontSize: { xs: 28, md: 32, web: 36 } } as const;

/** The legacy .btn box (40px, 24px sides) on MUI's Button; full width below `md`. */
const CTA = { minHeight: 40, px: 3, width: { xs: "100%", md: "auto" } } as const;

/**
 * Overline, headline, body and the two ways home — shared by the public not-found page (inside
 * the shell) and the root not-found page (outside it) so the copy and markup stay identical.
 * No "use client": both pages are Server Components, so the links are `component={NextLink}`.
 */
export function NotFoundBody() {
  return (
    <>
      <Typography component="p" variant="overline" sx={OVERLINE}>
        {NOT_FOUND.overline}
      </Typography>
      <Typography component="h1" variant="h4" sx={{ ...TITLE, mt: 0.5 }}>
        {NOT_FOUND.title}
      </Typography>
      <Typography variant="body1" sx={{ mx: "auto", mt: 1.5, maxWidth: 480, color: "text.secondary" }}>
        {NOT_FOUND.body}
      </Typography>
      <Box
        sx={{
          mt: 3,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: "center",
          justifyContent: "center",
          gap: 1.25,
        }}
      >
        <MuiButton component={NextLink} href={NOT_FOUND.primary.href} variant="contained" sx={CTA}>
          {NOT_FOUND.primary.label}
        </MuiButton>
        <MuiButton
          component={NextLink}
          href={NOT_FOUND.secondary.href}
          variant="outlined"
          color="secondary"
          sx={CTA}
        >
          {NOT_FOUND.secondary.label}
        </MuiButton>
      </Box>
    </>
  );
}
