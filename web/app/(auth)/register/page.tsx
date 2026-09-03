// Screen 2.1.2 Registration — see docs/Screen-Inventory.md §2.1.2 (Pattern A, §4.4) and
// design/source-prototype/screens/client-auth.jsx `C212_Registration` +
// client-auth-mobile.jsx `M212_Registration`. P1.
//
// This route used to be a redirect to /join, the 2.0.6 sign-up gate, which shipped first
// and carried the same fields. Both are now real and both earn their place: /join is the
// intent-aware card a visitor meets mid-browse ("create an account to save this"), and
// this is the plain front door that 2.1.1 links to. They share their rules through
// lib/validation/registration.ts so they cannot drift apart again.
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { RegisterForm } from "./RegisterForm";
import { REGISTER_TEXT } from "./state";

export const metadata: Metadata = {
  title: REGISTER_TEXT.metaTitle,
  description: REGISTER_TEXT.metaDescription,
  robots: { index: false, follow: true },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Sanitised at render as well as in the action. The action is what actually protects the
  // redirect, but a `next` that reaches the hidden input unchecked is one refactor away
  // from being read by something that trusts it.
  const next = safeNext(single(params.next));

  return (
    <AuthCard
      overline={REGISTER_TEXT.overline}
      title={REGISTER_TEXT.title}
      sub={REGISTER_TEXT.sub}
      footer={
        <>
          {REGISTER_TEXT.haveAccount}{" "}
          <Link href="/login" className="text-primary">
            {REGISTER_TEXT.signIn}
          </Link>
        </>
      }
    >
      <RegisterForm
        next={next}
        googleEnabled={env.googleAuthEnabled}
        appleEnabled={env.appleAuthEnabled}
      />
    </AuthCard>
  );
}
