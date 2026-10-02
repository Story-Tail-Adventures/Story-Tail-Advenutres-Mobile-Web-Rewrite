import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusChip } from "@/components/ui/StatusChip";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { SECURITY } from "./content";

export const metadata: Metadata = { title: "Security" };

/** The legacy `.btn` box (40px, 24px sides) on MUI's Button, for the two link buttons. */
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

/**
 * Screen Inventory 2.5.7 — Security Settings. §4.4 Pattern A.
 * Artboards: client-account.jsx `C257_Security`, client-account-mobile.jsx `M257_Security`.
 *
 * Two of the three panels are real and go through GoTrue, which is the established auth
 * write path in this repo rather than an Edge Function gap. The sessions panel cannot be
 * built at all.
 *
 * DEPARTURES, per the Screen Inventory note at 2.5.7:
 *
 *  · THE PASSWORD PANEL IS CONDITIONAL ON `auth_provider = 'email'`. A Google or Apple
 *    account has no password: "Last changed 14 March" would be a fabrication and "Change
 *    password" would lead nowhere. Those accounts get a "How you sign in" card instead.
 *  · THE SESSIONS LIST IS DISABLED, not rendered empty. `session` is a shadow table that
 *    NOTHING writes — Data-Model §5.1.1 says not to double-implement what GoTrue owns — so
 *    a list built on it would be permanently empty, and an empty list reads as "you are
 *    signed in nowhere", which is false. The real source is `auth.sessions`, which needs a
 *    service-role Edge Function to read. Per-session sign-out and "sign out everywhere" go
 *    with it.
 *  · NO LOCATION on a session row when it does arrive: `auth.sessions` holds an `ip` and
 *    nothing resolves it to a place, and `session.ip_country` has no writer.
 *  · NO "suspicious activity" panel. `auth_event` has never been written by anything.
 *  · NO BACKUP CODES, and no authenticator vendor named. `web/app/(auth)/mfa/setup/
 *    actions.ts` records that Supabase has no backup-code factor and a home-grown one could
 *    not be trusted; the factor is TOTP and any app works.
 *
 * MFA status is read through GoTrue rather than the `mfa_device` table, for the same reason.
 * Enrolment already has a screen (2.1.6) and this page links to it rather than growing a
 * second enrolment flow.
 */
export default async function SecurityPage() {
  const supabase = await createClient();

  const [{ data: account, error: accountError }, { data: factors }] = await Promise.all([
    supabase.from("account").select("auth_provider, mfa_enrolled_at").maybeSingle(),
    supabase.auth.mfa.listFactors(),
  ]);

  // On a failed read this falls back to the password card. That is the safe direction: the
  // card is inert (see below), so the worst case is offering a disabled control to an OAuth
  // account, rather than telling a password user they have none — which is what 2.5.8's
  // fallback used to do.
  if (accountError) console.warn("[account] security read failed", { code: accountError.code });
  const usesPassword = (account?.auth_provider ?? "email") === "email";
  const verified = factors?.all?.filter((f) => f.status === "verified") ?? [];
  const mfaOn = verified.length > 0;

  return (
    <div className="client-fill">
      <AccountHeader title={SECURITY.title} sub={SECURITY.subtitle} />

      <Box sx={{ mx: "auto", width: "100%", maxWidth: 672, p: { xs: 2, md: 3 } }}>
        {usesPassword ? (
          <Card sx={{ p: 2.5 }}>
            <Typography component="h2" variant="subtitle1">
              {SECURITY.passwordTitle}
            </Typography>
            <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {SECURITY.passwordBody}
            </Typography>
            {/* NOT a link to /forgot-password. That route is in the proxy's
                AUTH_ONLY_PREFIXES, so a signed-in visitor is bounced straight off it — the
                control would look live and do nothing for precisely the people who can
                reach this screen. A real in-place change needs its own form calling
                `supabase.auth.updateUser({ password })`, and that is a decision as much as
                a build: `secure_password_change` is currently false in supabase/config.toml,
                so a stolen session could change a password with no reauthentication. The
                Screen Inventory note at 2.5.7 records it. */}
            <Box sx={{ mt: 2 }}>
              <Button variant="tonal" fullWidth disabled aria-disabled="true">
                {SECURITY.passwordCta}
              </Button>
            </Box>
            <Typography component="p" variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
              {SECURITY.passwordDeferred}
            </Typography>
          </Card>
        ) : (
          <Card sx={{ p: 2.5 }}>
            <Typography component="h2" variant="subtitle1">
              {SECURITY.noPasswordTitle}
            </Typography>
            <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
              {SECURITY.noPasswordBody(account?.auth_provider ?? "your provider")}
            </Typography>
            <MuiButton
              component={NextLink}
              href="/account/connected"
              variant="outlined"
              color="primary"
              fullWidth
              sx={{ ...BTN_SX, mt: 2 }}
            >
              {SECURITY.noPasswordCta}
            </MuiButton>
          </Card>
        )}

        <Card sx={{ mt: 1.5, p: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography component="h2" variant="subtitle1" sx={{ flex: 1 }}>
              {SECURITY.mfaTitle}
            </Typography>
            {/* The legacy `.chip-status.booked` is the shared StatusChip; the "off" state was
                the plain `.chip`, which is MUI's outlined Chip. */}
            {mfaOn ? (
              <StatusChip kind="booked" label={SECURITY.mfaOn} />
            ) : (
              <Chip size="small" variant="outlined" label={SECURITY.mfaOff} />
            )}
          </Box>
          <Typography component="p" variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
            {SECURITY.mfaBody}
          </Typography>
          {/* Enrolling works and is a real link. MANAGING an existing factor is not: 2.1.6
              redirects anyone who already has a verified factor straight back out, and its
              own comment says why — "enrolling a second one from this screen is Security
              Settings' job (2.5.7), not first-run's". That job is this screen's and is not
              built, so the control says so instead of bouncing the reader off 2.1.6. */}
          {mfaOn ? (
            <>
              <Box sx={{ mt: 2 }}>
                <Button variant="tonal" fullWidth disabled aria-disabled="true">
                  {SECURITY.mfaManageCta}
                </Button>
              </Box>
              <Typography component="p" variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
                {SECURITY.mfaManageDeferred}
              </Typography>
            </>
          ) : (
            <MuiButton
              component={NextLink}
              href="/mfa/setup"
              variant="outlined"
              color="secondary"
              fullWidth
              sx={{ ...BTN_SX, mt: 2 }}
            >
              {SECURITY.mfaEnableCta}
            </MuiButton>
          )}
        </Card>

        <Typography component="h2" variant="overline" sx={GROUP_LABEL_SX}>
          {SECURITY.sessionsHeading}
        </Typography>
        <Card sx={{ display: "flex", gap: 1.5, p: 2 }}>
          <Box sx={{ display: "inline-flex", flexShrink: 0, color: "text.secondary" }}>
            <Icon name="shield" size={18} />
          </Box>
          <Box>
            <Typography component="p" variant="body2" sx={{ color: "text.secondary" }}>
              {SECURITY.sessionsDeferred}
            </Typography>
            <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
              {SECURITY.sessionsAdvice}
            </Typography>
          </Box>
        </Card>
      </Box>
    </div>
  );
}
