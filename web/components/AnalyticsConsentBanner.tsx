"use client";

import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { useAnalyticsConsent, writeAnalyticsConsent } from "@/lib/analytics-consent";
import { firebaseAnalyticsConfigured } from "@/lib/firebase";
import { ANALYTICS_CONSENT } from "@/content/public/analytics-consent";

/**
 * Asks once whether Google Analytics may count this visit. P1, web only.
 *
 * Shown only when there is something to ask about (Firebase is configured) and nothing has
 * been answered yet, and never on `/agent/*`. Renders nothing on the server: the answer
 * lives in localStorage, so a server-drawn banner would flash for everyone who answered.
 *
 * NOT IN THE DESIGN PROJECT. No artboard draws a consent prompt; this is a plain card in
 * the Design System's surface and button language, sitting above the client bottom nav.
 */
export function AnalyticsConsentBanner() {
  const consent = useAnalyticsConsent();
  const pathname = usePathname();

  if (!firebaseAnalyticsConfigured || consent !== null) return null;
  if (pathname === "/agent" || pathname.startsWith("/agent/")) return null;

  return (
    <Paper
      role="region"
      aria-label={ANALYTICS_CONSENT.bannerLabel}
      elevation={3}
      sx={{
        position: "fixed",
        zIndex: 40,
        left: 16,
        right: 16,
        // Clears the client bottom nav on phones; the web layout has none.
        bottom: { xs: 88, md: 16 },
        mx: "auto",
        maxWidth: 560,
        p: 2,
        bgcolor: "surface.2",
      }}
    >
      <Typography component="p" variant="body2">
        {ANALYTICS_CONSENT.bannerBody}{" "}
        <MuiLink component={NextLink} href="/legal/cookies">
          {ANALYTICS_CONSENT.cookiesLink}
        </MuiLink>
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
        <Button variant="outlined" size="sm" onClick={() => writeAnalyticsConsent("denied")}>
          {ANALYTICS_CONSENT.decline}
        </Button>
        <Button variant="outlined" size="sm" onClick={() => writeAnalyticsConsent("granted")}>
          {ANALYTICS_CONSENT.allow}
        </Button>
      </Box>
    </Paper>
  );
}
