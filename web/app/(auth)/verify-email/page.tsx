// Screen 2.1.3 Email Verification — see docs/Screen-Inventory.md §2.1.3 (Pattern A
// simplified, §4.4) and design/source-prototype/screens/client-auth.jsx
// `C213_EmailVerification` + client-auth-mobile.jsx `M213_EmailVerification`. P1.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { VerifyEmailPanel } from "./VerifyEmailPanel";
import { VERIFY_TEXT } from "./state";

export const metadata: Metadata = {
  title: VERIFY_TEXT.metaTitle,
  description: VERIFY_TEXT.metaDescription,
  robots: { index: false, follow: true },
};

/**
 * Reached from two directions (§2.1.3 entry points): straight after registering, and from
 * the `email_not_confirmed` sign-in error, whose "Resend it" action points here.
 *
 * Neither has a session — GoTrue withholds one until the address is confirmed — so the
 * common case is the anonymous one, where the panel asks for the address. A session only
 * turns up when confirmations are switched off or when someone comes back after
 * confirming; the second of those is why an already-verified visitor is sent away rather
 * than shown a screen telling them to do something they have already done.
 */
export default async function VerifyEmailPage() {
  const user = await currentUser();

  if (user?.confirmed) redirect("/dashboard");

  return (
    <AuthCard
      overline={VERIFY_TEXT.overline}
      title={VERIFY_TEXT.title}
      sub={
        user?.email ? (
          <>
            {VERIFY_TEXT.subKnown}
            <b className="font-semibold text-on-surface">{user.email}</b>.
          </>
        ) : (
          VERIFY_TEXT.subUnknown
        )
      }
    >
      <VerifyEmailPanel sessionEmail={user?.email ?? null} />
    </AuthCard>
  );
}

async function currentUser(): Promise<{ email: string | null; confirmed: boolean } | null> {
  if (env.authChecksDisabledForLocalDev) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { email: user.email ?? null, confirmed: Boolean(user.email_confirmed_at) };
}
