"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useAnalyticsConsent, writeAnalyticsConsent } from "@/lib/analytics-consent";
import { firebaseAnalyticsConfigured } from "@/lib/firebase";
import { ANALYTICS_CONSENT } from "@/content/public/analytics-consent";

/**
 * The prototype's "Analytics" tracking row on 2.5.9 (C259_Privacy), back now that there is
 * a tracker to switch. Essential cookies and Marketing stay out: the first is not a choice
 * and the second does not exist. Hidden when Firebase is not configured, for the same reason.
 *
 * Unanswered reads as off, because it is off until someone says yes.
 */
export function AnalyticsSwitch() {
  const consent = useAnalyticsConsent();
  if (!firebaseAnalyticsConfigured) return null;

  const id = "analytics-switch-label";
  return (
    <Card sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2, mt: 1.5 }}>
      <Box sx={{ flex: 1 }}>
        <Typography id={id} component="p" variant="subtitle1">
          {ANALYTICS_CONSENT.switchLabel}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {ANALYTICS_CONSENT.switchSub}
        </Typography>
      </Box>
      <Switch
        checked={consent === "granted"}
        disabled={consent === undefined}
        onChange={(_, on) => writeAnalyticsConsent(on ? "granted" : "denied")}
        slotProps={{ input: { "aria-labelledby": id } }}
      />
    </Card>
  );
}
