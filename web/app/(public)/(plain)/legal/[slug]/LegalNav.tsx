import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import type { LegalSlug } from "@/content/public/types";
import { TAP_TARGET, UP_MD } from "@/lib/mui/sx";
import { LEGAL_PAGE, legalHref } from "./content";

interface LegalNavProps {
  active: LegalSlug;
}

/**
 * The mobile chip keeps the 28px chip height the rest of the public surface uses. On touch
 * screens the hit area reaches 8px past the chip on every side (the legacy `.tap-44`) rather
 * than growing the chip itself, which would turn the strip into a row of pills.
 */
const CHIP = { height: 28, ...TAP_TARGET } as const;

/**
 * Section nav for the legal pages (design: C207 aside / M207 chip strip).
 *
 * From `md` it is the 260px first track of the page grid: a surface-1 column with the
 * "LEGAL & COMPLIANCE" label, one ListItemButton per document (full titles, as on the desktop
 * artboard) and the print tip. Below `md` the same documents render as a snap chip strip of
 * MUI Chips using each document's short `navLabel`, the open one filled secondary (the §8 chip
 * mapping). `aria-current` marks the open document in both. `.legal-nav` stays as the hook
 * the print rule in public.css hides the whole thing by.
 */
export function LegalNav({ active }: LegalNavProps) {
  return (
    <Box
      component="nav"
      aria-label={LEGAL_PAGE.navLabel}
      className="legal-nav"
      sx={{ [UP_MD]: { borderRight: 1, borderColor: "divider", bgcolor: "surface.1" } }}
    >
      {/* md and up: aside column */}
      <Box sx={{ display: { xs: "none", md: "block" }, p: 2.75 }}>
        <Typography
          component="p"
          variant="overline"
          sx={{ display: "block", mb: 1.25, lineHeight: 1.3, color: "text.secondary" }}
        >
          {LEGAL_PAGE.navHeading}
        </Typography>
        <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          {LEGAL_SLUGS.map((slug) => {
            const isActive = slug === active;
            return (
              <ListItem key={slug} disablePadding>
                <ListItemButton
                  component={NextLink}
                  href={legalHref(slug)}
                  selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  sx={{ borderRadius: 1, px: 1.5, py: 1 }}
                >
                  <ListItemText
                    primary={LEGAL_DOCS[slug].title}
                    slotProps={{ primary: { variant: "body2", sx: { fontWeight: 500 } } }}
                    sx={{ my: 0 }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
        <Paper elevation={0} sx={{ mt: 2.5, p: 1.5, bgcolor: "surface.2" }}>
          <Typography variant="caption" sx={{ fontWeight: 500, color: "text.secondary" }}>
            {LEGAL_PAGE.tip}
          </Typography>
        </Paper>
      </Box>

      {/* Below md: chip strip (M207). `.h-scroll` bleeds into the 18px gutter the wrapper sets. */}
      <Box sx={{ display: { md: "none" }, px: 2.25, pt: 0.75 }}>
        <Box component="ul" className="h-scroll" sx={{ pt: 1, listStyle: "none" }}>
          {LEGAL_SLUGS.map((slug) => {
            const isActive = slug === active;
            return (
              <li key={slug}>
                <Chip
                  component={NextLink}
                  href={legalHref(slug)}
                  clickable
                  label={LEGAL_DOCS[slug].navLabel}
                  variant={isActive ? "filled" : "outlined"}
                  color={isActive ? "secondary" : "default"}
                  aria-current={isActive ? "page" : undefined}
                  sx={CHIP}
                />
              </li>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
