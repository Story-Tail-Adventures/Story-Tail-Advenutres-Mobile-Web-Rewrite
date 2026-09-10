import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { createClient } from "@/lib/supabase/server";

import { AccountHeader } from "../AccountHeader";
import { SECURITY } from "./content";

export const metadata: Metadata = { title: "Security" };

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

  const [{ data: account }, { data: factors }] = await Promise.all([
    supabase.from("account").select("auth_provider, mfa_enrolled_at").maybeSingle(),
    supabase.auth.mfa.listFactors(),
  ]);

  const usesPassword = (account?.auth_provider ?? "email") === "email";
  const verified = factors?.all?.filter((f) => f.status === "verified") ?? [];
  const mfaOn = verified.length > 0;

  return (
    <div className="client-fill">
      <AccountHeader title={SECURITY.title} sub={SECURITY.subtitle} />

      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        {usesPassword ? (
          <Card className="p-5">
            <h2 className="t-title-s">{SECURITY.passwordTitle}</h2>
            <p className="t-body-s mt-1 text-on-surface-variant">{SECURITY.passwordBody}</p>
            {/* NOT a link to /forgot-password. That route is in the proxy's
                AUTH_ONLY_PREFIXES, so a signed-in visitor is bounced straight off it — the
                control would look live and do nothing for precisely the people who can
                reach this screen. A real in-place change needs its own form calling
                `supabase.auth.updateUser({ password })`, and that is a decision as much as
                a build: `secure_password_change` is currently false in supabase/config.toml,
                so a stolen session could change a password with no reauthentication. The
                Screen Inventory note at 2.5.7 records it. */}
            <button
              type="button"
              className="btn btn-tonal mt-4 w-full"
              disabled
              aria-disabled="true"
            >
              {SECURITY.passwordCta}
            </button>
            <p className="t-body-s mt-2 text-on-surface-variant">{SECURITY.passwordDeferred}</p>
          </Card>
        ) : (
          <Card className="p-5">
            <h2 className="t-title-s">{SECURITY.noPasswordTitle}</h2>
            <p className="t-body-s mt-1 text-on-surface-variant">
              {SECURITY.noPasswordBody(account?.auth_provider ?? "your provider")}
            </p>
            <Link href="/account/connected" className="btn btn-outlined mt-4 w-full">
              {SECURITY.noPasswordCta}
            </Link>
          </Card>
        )}

        <Card className="mt-3 p-5">
          <div className="flex items-center gap-2">
            <h2 className="t-title-s flex-1">{SECURITY.mfaTitle}</h2>
            <span className={mfaOn ? "chip-status booked" : "chip"}>
              {mfaOn ? SECURITY.mfaOn : SECURITY.mfaOff}
            </span>
          </div>
          <p className="t-body-s mt-1.5 text-on-surface-variant">{SECURITY.mfaBody}</p>
          {/* Enrolling works and is a real link. MANAGING an existing factor is not: 2.1.6
              redirects anyone who already has a verified factor straight back out, and its
              own comment says why — "enrolling a second one from this screen is Security
              Settings' job (2.5.7), not first-run's". That job is this screen's and is not
              built, so the control says so instead of bouncing the reader off 2.1.6. */}
          {mfaOn ? (
            <>
              <button
                type="button"
                className="btn btn-tonal mt-4 w-full"
                disabled
                aria-disabled="true"
              >
                {SECURITY.mfaManageCta}
              </button>
              <p className="t-body-s mt-2 text-on-surface-variant">{SECURITY.mfaManageDeferred}</p>
            </>
          ) : (
            <Link href="/mfa/setup" className="btn btn-tonal mt-4 w-full">
              {SECURITY.mfaEnableCta}
            </Link>
          )}
        </Card>

        <h2 className="t-label mt-6 mb-2 px-1 tracking-wide text-on-surface-variant">
          {SECURITY.sessionsHeading}
        </h2>
        <Card className="flex gap-3 p-4">
          <Icon name="shield" size={18} className="shrink-0 text-on-surface-variant" />
          <div>
            <p className="t-body-s text-on-surface-variant">{SECURITY.sessionsDeferred}</p>
            <p className="t-body-s mt-2 text-on-surface-variant">{SECURITY.sessionsAdvice}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
