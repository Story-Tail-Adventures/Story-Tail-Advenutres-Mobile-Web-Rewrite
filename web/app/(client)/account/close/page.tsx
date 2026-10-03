import type { Metadata } from "next";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { CLOSE } from "./content";

export const metadata: Metadata = {
  title: "Close account",
  robots: { index: false, follow: false },
};

/** The legacy `.btn-text` box (40px, 12px sides) on MUI's Button, for the keep-account link. */
const TEXT_BTN_SX = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

/**
 * Screen Inventory 2.5.10 — Account Closure. §4.4 Pattern J (destructive confirmation).
 * Artboards: client-account.jsx `C2510_Closure`, client-account-mobile.jsx `M2510_Closure`.
 *
 * READ-ONLY today: the CTA is disabled because NO Edge Function writes to `account` — a grep
 * across supabase/functions returns zero hits for that table — and PostgREST is refused
 * twice over (no write policy, and the write verbs are not granted).
 *
 * A full-screen route, NOT a modal or a bottom sheet. Same argument §2.2.9 makes for the
 * status-change screen: a destructive confirmation with a text field deserves its own URL
 * and its own Back, and on mobile a sheet's grabber reads as "swipe this away", which is
 * exactly wrong here.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.10:
 *  · Confirmation is a TYPED EMAIL, not a password re-entry. `auth_provider` is
 *    ('email','google','apple'), so a Google or Apple account has no password and the
 *    artboard's password field is a wall those accounts cannot pass.
 *  · NO "within 30 days". Data-Model §18.5 describes that window and nothing implements it
 *    — no migration, no pg_cron entry, no function. A dated retention promise on a legal
 *    screen is the class of claim PUBLIC_CLAIMS_MODE=strict exists to stop.
 *  · Card revocation is stated as a CONSEQUENCE, which is true whether or not §2.4 shipped.
 *  · The reason field has no column of its own — `account.locked_reason` is agent-facing and
 *    withheld from clients — so it is disabled alongside the CTA rather than collected into
 *    the wrong place. See the note for the two options.
 */
export default async function CloseAccountPage() {
  const supabase = await createClient();
  const { data: account } = await supabase.from("account").select("email").maybeSingle();

  return (
    <div className="client-fill">
      <AccountHeader
        title={CLOSE.title}
        backHref="/account/privacy"
        backLabel={CLOSE.back}
      />

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            aria-hidden="true"
            sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: "error.container", color: "error.onContainer" }}
          >
            <Icon name="warning" size={20} />
          </Avatar>
          <Typography component="h2" variant="h5">
            {CLOSE.heading}
          </Typography>
        </Box>

        {/* The legacy card-flat: outlined on surface.2 (components/ui/Card). */}
        <Card variant="outlined" sx={{ p: 2, bgcolor: "surface.2" }}>
          <Typography
            component="p"
            variant="overline"
            sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}
          >
            {CLOSE.whatHappensLabel}
          </Typography>
          {/* The element reset (styles/reset.css) strips list markers, so the disc is set back explicitly. */}
          <Box
            component="ul"
            sx={{ m: 0, p: 0, mt: 0.75, pl: 2.5, listStyleType: "disc", typography: "body2", lineHeight: "28px" }}
          >
            {CLOSE.whatHappens.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
        </Card>

        <Paper elevation={0} sx={{ mt: 1.5, p: 2, bgcolor: "secondary.container", color: "secondary.onContainer" }}>
          <Typography component="p" variant="body2">
            {CLOSE.reconsiderBody}{" "}
            {/* 2.6.3 rather than a `mailto:`. Somebody about to close their account and
                choosing to write first should reach the thread their advisor actually reads,
                not an email client that may not be configured on the device at all. */}
            <MuiLink component={NextLink} href="/messages/new" color="inherit" sx={{ fontWeight: 600 }}>
              {CLOSE.reconsiderCta}
            </MuiLink>
          </Typography>
        </Paper>

        <Box sx={{ mt: 2.5 }}>
          <TextareaField
            id="closure-reason"
            label={CLOSE.reasonLabel}
            name="reason"
            rows={3}
            placeholder={CLOSE.reasonPlaceholder}
            disabled
          />
        </Box>

        <Box sx={{ mt: 1.5 }}>
          <Field
            id="closure-confirm-email"
            label={CLOSE.confirmLabel}
            name="confirmEmail"
            type="email"
            placeholder={account?.email ?? CLOSE.confirmPlaceholder}
            hint={CLOSE.confirmHint}
            disabled
          />
        </Box>

        <Box sx={{ mt: 2.5 }}>
          <Button
            variant="danger"
            fullWidth
            disabled
            aria-disabled="true"
            title={CLOSE.deferred}
          >
            {CLOSE.confirmCta}
          </Button>
        </Box>
        <Typography
          component="p"
          variant="caption"
          sx={{ mt: 1, display: "block", textAlign: "center", color: "text.secondary" }}
        >
          {CLOSE.deferred}
        </Typography>

        <MuiButton
          component={NextLink}
          href="/account"
          variant="text"
          color="primary"
          fullWidth
          sx={{ ...TEXT_BTN_SX, mt: 1 }}
        >
          {CLOSE.keepCta}
        </MuiButton>
      </Box>
    </div>
  );
}
