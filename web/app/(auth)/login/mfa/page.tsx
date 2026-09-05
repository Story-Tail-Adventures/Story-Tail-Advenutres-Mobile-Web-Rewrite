// Screen 2.1.7 MFA Challenge — see docs/Screen-Inventory.md §2.1.7 (Pattern A, §4.4) and
// design/source-prototype/screens/client-auth.jsx `C217_MFAChallenge` +
// client-auth-mobile.jsx `M217_MFAChallenge`. P1.
//
// Reached by redirect, not by a link: web/lib/supabase/middleware.ts sends every request
// from a session that has a verified factor but has not been challenged here first. That
// routing function also guards this page's own preconditions — signed out goes to /login,
// and nothing-to-prove goes to /dashboard — so by the time this renders there is a factor
// waiting to be answered.
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { MfaChallengeForm } from "./MfaChallengeForm";
import { MFA_CHALLENGE_TEXT } from "./state";

export const metadata: Metadata = {
  title: MFA_CHALLENGE_TEXT.metaTitle,
  description: MFA_CHALLENGE_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeNext(single(params.next));

  return (
    <AuthCard
      overline={MFA_CHALLENGE_TEXT.overline}
      title={MFA_CHALLENGE_TEXT.title}
      sub={MFA_CHALLENGE_TEXT.sub}
    >
      <MfaChallengeForm next={next} />
    </AuthCard>
  );
}
