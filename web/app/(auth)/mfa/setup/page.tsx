// Screen 2.1.6 MFA Setup — see docs/Screen-Inventory.md §2.1.6 (Pattern A, §4.4) and
// design/source-prototype/screens/client-auth.jsx `C216_MFASetup` + client-auth-mobile.jsx
// `M216_MFASetup`. P1.
//
// MFA is optional for clients and required for agents (§2.1.6, and 3.1.6 for the agent
// side, which is not built). Entry points are Security Settings and the soft prompt after
// a first payment card — neither of which exists yet, so today this is reached directly.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { MfaSetupForm } from "./MfaSetupForm";
import { MFA_SETUP_TEXT } from "./state";

export const metadata: Metadata = {
  title: MFA_SETUP_TEXT.metaTitle,
  description: MFA_SETUP_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeNext(single(params.next));

  // Someone who already has a verified factor has nothing to do here, and enrolling a
  // second one from this screen is Security Settings' job (2.5.7), not first-run's.
  if (await hasVerifiedFactor()) redirect(next);

  return (
    <AuthCard
      overline={MFA_SETUP_TEXT.overline}
      title={MFA_SETUP_TEXT.title}
      sub={MFA_SETUP_TEXT.sub}
    >
      <MfaSetupForm next={next} />
    </AuthCard>
  );
}

async function hasVerifiedFactor(): Promise<boolean> {
  if (env.authChecksDisabledForLocalDev) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.all ?? []).some((factor) => factor.status === "verified");
}
