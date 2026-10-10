import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";

/**
 * Pattern A shell for the 2.1.x authentication screens.
 *
 * Screen Inventory §4.4 maps 2.1.1 to Pattern A with no deviations:
 *   web    — split pane, brand panel beside a narrow form column
 *   mobile — single full-width column (the brand panel is hidden below lg)
 *
 * Proportions follow `MuiScreenFrame chrome="split"` and `MuiScreenSplitBrand` in
 * design/source-prototype/shared/mui-kit.jsx: a 42% brand panel and a max-width 440px
 * form column with 14px between its rows.
 *
 * ON MUI (step 2 of the migration). Boxes and Typography; the gradient stays the shared
 * `.tropical-gradient` class because the kit keeps it too and its stops are brand hexes
 * that have no palette path. The panel's text is `common.white` and the overline is
 * `brandSource.gold`, which is the same gold in both schemes — the panel is always dark.
 * The 85% and 45% whites are an `opacity` on the element and a `color-mix` of
 * `currentColor`, since sx has no alpha for a palette path.
 *
 * Server Component: every prop is a plain sx object or a string.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box sx={{ display: "flex", flex: 1, minHeight: "100dvh", bgcolor: "surface.main" }}>
      <Box component="aside" className="tropical-gradient" sx={BRAND_PANEL_SX}>
        <BrandMark size={96} tone="dark" />

        {/* Decorative passport stamp, per MuiScreenSplitBrand in the prototype. */}
        <Box aria-hidden="true" sx={STAMP_SX}>
          <Box sx={{ display: "inline-flex", opacity: 0.8 }}>
            <Icon name="passport" size={36} strokeWidth={1.6} />
          </Box>
        </Box>

        <Box sx={{ mt: "auto" }}>
          <Typography
            variant="overline"
            sx={{ display: "block", color: "brandSource.gold", fontWeight: 600, lineHeight: 1.3, mb: 1.25 }}
          >
            STORY-TAIL · MEMBER PORTAL
          </Typography>
          <Typography
            variant="h4"
            component="h2"
            sx={{ color: "common.white", fontWeight: 700, whiteSpace: "pre-line", lineHeight: 1.1 }}
          >
            {"Your next chapter is\nalready in the works."}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: "common.white", opacity: 0.85 }}>
            Every detail in one place — so the only thing left to do is rest.
          </Typography>
        </Box>
      </Box>

      <Box
        component="main"
        sx={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 3, sm: 4 },
        }}
      >
        {/* `useFlexGap`: a real `gap`, not margins on the children. AuthCard's footer sits on
            `mt: "auto"`, which Stack's margin-based spacing would overwrite. */}
        <Stack spacing={1.75} useFlexGap sx={{ width: "100%", maxWidth: 440 }}>
          {/* The brand panel is hidden on small screens, so the wordmark comes along. */}
          <Box sx={{ mb: 0.5, display: { xs: "block", lg: "none" } }}>
            <BrandMark size={80} />
          </Box>
          {children}
        </Stack>
      </Box>
    </Box>
  );
}

const BRAND_PANEL_SX = {
  position: "relative",
  display: { xs: "none", lg: "flex" },
  flex: "0 0 42%",
  flexDirection: "column",
  overflow: "hidden",
  py: 4,
  px: 4.5,
  color: "common.white",
} as const;

const STAMP_SX = {
  position: "absolute",
  top: 28,
  right: 28,
  width: 96,
  height: 96,
  borderRadius: "50%",
  border: "1.5px dashed",
  borderColor: "color-mix(in srgb, currentColor 45%, transparent)",
  color: "common.white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transform: "rotate(-10deg)",
} as const;
