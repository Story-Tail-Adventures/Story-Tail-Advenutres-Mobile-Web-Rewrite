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
            <Link href="/forgot-password" className="btn btn-tonal mt-4 w-full">
              {SECURITY.passwordCta}
            </Link>
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
          <Link href="/mfa/setup" className="btn btn-tonal mt-4 w-full">
            {mfaOn ? SECURITY.mfaManageCta : SECURITY.mfaEnableCta}
          </Link>
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
