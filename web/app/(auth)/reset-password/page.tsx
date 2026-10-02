// Screen 2.1.5 Reset Password — see docs/Screen-Inventory.md §2.1.5 (Pattern A, §4.4) and
// design/source-prototype/screens/client-auth.jsx `C215_ResetPassword` +
// client-auth-mobile.jsx `M215_ResetPassword`. P1.
import type { Metadata } from "next";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { AuthCard } from "@/components/auth/AuthCard";
import NextLink from "@/components/mui/NextLink";
import { Card } from "@/components/ui/Card";
import { env } from "@/lib/env";
import { TAP_TARGET } from "@/lib/mui/sx";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { RESET_TEXT } from "./state";

export const metadata: Metadata = {
  title: RESET_TEXT.metaTitle,
  description: RESET_TEXT.metaDescription,
  robots: { index: false, follow: true },
};

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

/**
 * Reached from the emailed link, by way of /auth/callback which exchanges the code for a
 * recovery session. That session is the only authority for whose password this changes —
 * see ./actions.ts.
 *
 * This route is in neither PROTECTED_PREFIXES nor AUTH_ONLY_PREFIXES
 * (web/lib/supabase/middleware.ts) and both omissions are deliberate. Protected would be
 * wrong because the person arriving has forgotten their password and may look signed out
 * for a moment; auth-only would be actively broken, because a recovery session IS a
 * session and the proxy would bounce them to the dashboard instead of letting them finish.
 *
 * Server Component: the expired-link card below passes MUI only plain sx objects.
 */
export default async function ResetPasswordPage() {
  const signedIn = await hasSession();

  return (
    <AuthCard
      overline={RESET_TEXT.overline}
      title={signedIn ? RESET_TEXT.title : RESET_TEXT.expiredTitle}
      sub={signedIn ? RESET_TEXT.sub : undefined}
    >
      {signedIn ? (
        <ResetPasswordForm />
      ) : (
        <Card variant="flat">
          <CardContent
            sx={{ display: "flex", flexDirection: "column", p: 2, "&:last-child": { pb: 2 } }}
          >
            <Typography variant="body2" color="text.secondary">
              {RESET_TEXT.expiredBody}
            </Typography>
            <MuiLink
              component={NextLink}
              href="/forgot-password"
              variant="subtitle2"
              sx={{ ...TAP_LINK, mt: 1.25, alignSelf: "flex-start" }}
            >
              {RESET_TEXT.expiredCta}
            </MuiLink>
          </CardContent>
        </Card>
      )}
    </AuthCard>
  );
}

async function hasSession(): Promise<boolean> {
  // Before `supabase start` has ever run there is nothing to ask, and the design is still
  // worth looking at — render the form rather than the expired-link state.
  if (env.authChecksDisabledForLocalDev) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}
