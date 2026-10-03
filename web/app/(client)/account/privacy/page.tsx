import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

import { AccountHeader } from "../AccountHeader";
import { PRIVACY } from "./content";

export const metadata: Metadata = { title: "Privacy & data" };

/** The legacy `.btn` box (40px, 24px sides) on MUI's Button, for the link button. */
const BTN_SX = { minHeight: 40, px: "24px", gap: 1, whiteSpace: "nowrap" } as const;

/** The uppercase group label SettingsGroup draws, for a section here that is not one. */
const GROUP_LABEL_SX = {
  display: "block",
  mt: 3,
  mb: 1,
  px: 0.5,
  lineHeight: 1.3,
  color: "text.secondary",
} as const;

const TITLE_ROW_SX = { display: "flex", alignItems: "center", gap: 1 } as const;

/**
 * Screen Inventory 2.5.9 — Privacy & Data Export. §4.4 Pattern A.
 * Artboards: client-account.jsx `C259_Privacy`, client-account-mobile.jsx `M259_Privacy`.
 *
 * READ-ONLY today. Everything shown is static or already-published content; the one action
 * is disabled with a reason.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.9:
 *  · The Analytics / Marketing tracking toggles are GONE, replaced by a statement. There is
 *    no analytics script, tag manager or advertising pixel anywhere in web/, and
 *    web/content/public/legal/cookies.ts already tells people in writing that we run none.
 *    Switches over nothing are a control that lies, and they contradicted a shipped legal
 *    page. They come back the day a tracker does.
 *  · The export does NOT claim to include the document-access trail. Every signature from
 *    trip-document-url writes an `audit_event`, but that is the agency's table and §2.2
 *    deliberately gave clients no policy on it — naming it here would promise data the
 *    client has no path to.
 *  · "Request an export" is DISABLED: there is no `data_export_request` entity to write to
 *    and no Edge Function that creates one. Reading a status out of `audit_event` is the
 *    side door §2.2 refused. The entity has to land first — it is specified in the Screen
 *    Inventory note and belongs in Data-Model §18.5.
 */
export default function PrivacyPage() {
  return (
    <div className="client-fill">
      <AccountHeader title={PRIVACY.title} sub={PRIVACY.subtitle} />

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        <Card sx={{ p: 2.5 }}>
          <Box sx={TITLE_ROW_SX}>
            <Icon name="download" size={18} />
            <Typography component="h2" variant="subtitle1">
              {PRIVACY.exportTitle}
            </Typography>
          </Box>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
            {PRIVACY.exportBody}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="filled"
              fullWidth
              disabled
              aria-disabled="true"
              title={PRIVACY.exportDeferred}
            >
              {PRIVACY.exportCta}
            </Button>
          </Box>
          <Typography
            component="p"
            variant="caption"
            sx={{ mt: 1, display: "block", textAlign: "center", color: "text.secondary" }}
          >
            {PRIVACY.exportDeferred}
          </Typography>
        </Card>

        <Typography component="h2" variant="overline" sx={GROUP_LABEL_SX}>
          {PRIVACY.trackingHeading}
        </Typography>
        <Card sx={{ display: "flex", gap: 1.5, p: 2 }}>
          <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
            <Icon name="shield" size={18} />
          </Box>
          <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
            {PRIVACY.trackingBody}{" "}
            <MuiLink component={NextLink} href="/legal/cookies">
              {PRIVACY.cookiesLink}
            </MuiLink>
          </Typography>
        </Card>

        {/* The artboard's closure panel: a flat Paper on error.container with a contained
            error button, in place of the legacy card's inverted on-container button. */}
        <Paper elevation={0} sx={{ mt: 3, p: 2.5, bgcolor: "error.container", color: "error.onContainer" }}>
          <Box sx={TITLE_ROW_SX}>
            <Icon name="warning" size={18} />
            <Typography component="h2" variant="subtitle1">
              {PRIVACY.closeTitle}
            </Typography>
          </Box>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, opacity: 0.9 }}>
            {PRIVACY.closeBody}
          </Typography>
          <MuiButton
            component={NextLink}
            href="/account/close"
            variant="contained"
            color="error"
            fullWidth
            sx={{ ...BTN_SX, mt: 2 }}
          >
            {PRIVACY.closeCta}
          </MuiButton>
        </Paper>
      </Box>
    </div>
  );
}
