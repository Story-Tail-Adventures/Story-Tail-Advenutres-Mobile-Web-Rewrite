import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { FOOTER_LEGAL_LINKS, MARKETING_SITE_URL } from "@/content/public/contact";
import { Container } from "./Container";

/**
 * Footer links are the only route to the 2.0.7 legal pages on a phone, so they carry a
 * real 44px touch row below `md` (they measured 16px tall, well under the tap floor the
 * rest of the public surface holds to). From `md` they go back to inline density.
 */
const FOOTER_LINK = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: { xs: 44, md: 0 },
  fontWeight: 500,
  "&:hover": { color: "text.primary" },
} as const;

/** Read by assistive tech only — the sr-only recipe, in sx. `1px` strings: a bare 1 is 100%. */
const SR_ONLY = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/**
 * Global public footer (design: C201 footer; Screen Inventory 2.0.7 "footer of every
 * screen"). The marketing site stays a separate property (BRD §4.2); we only link to it.
 *
 * `.pub-footer` stays as the hook the print rule in styles/public.css hides the footer by.
 */
export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <Box component="footer" className="pub-footer" sx={{ borderTop: 1, borderColor: "divider", bgcolor: "surface.1" }}>
      <Container
        size="wide"
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 1.25,
          py: { xs: 1.75, md: 1.5 },
          alignItems: { md: "center" },
          justifyContent: { md: "space-between" },
          color: "text.secondary",
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 500 }}>
          © {year} Story-Tail Adventures · Hosted by Inteletravel
        </Typography>
        <Box component="nav" aria-label="Legal">
          <Stack
            component="ul"
            direction="row"
            useFlexGap
            sx={{ flexWrap: "wrap", columnGap: 2, rowGap: 1, m: 0, p: 0, listStyle: "none" }}
          >
            {FOOTER_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <MuiLink
                  component={NextLink}
                  href={link.href}
                  underline="hover"
                  variant="caption"
                  color="inherit"
                  sx={FOOTER_LINK}
                >
                  {link.label}
                </MuiLink>
              </li>
            ))}
            <li>
              <MuiLink
                component={NextLink}
                href="/how-it-works"
                underline="hover"
                variant="caption"
                color="inherit"
                sx={FOOTER_LINK}
              >
                How it works
              </MuiLink>
            </li>
            <li>
              <MuiLink
                href={MARKETING_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                variant="caption"
                color="inherit"
                sx={{ ...FOOTER_LINK, gap: 0.5 }}
              >
                Marketing site <Icon name="external" size={11} />
                <Box component="span" sx={SR_ONLY}>
                  (opens in a new tab)
                </Box>
              </MuiLink>
            </li>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
