// Screen 2.1.4 Forgot Password — see docs/Screen-Inventory.md §2.1.4 (Pattern A, §4.4) and
// design/source-prototype/screens/client-auth.jsx `C214_ForgotPassword` +
// client-auth-mobile.jsx `M214_ForgotPassword`. P1.
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { FORGOT_TEXT } from "./state";

export const metadata: Metadata = {
  title: FORGOT_TEXT.metaTitle,
  description: FORGOT_TEXT.metaDescription,
  // Nothing here is worth indexing, and a password-reset form in search results is an
  // invitation to phish. Links out are fine to follow.
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      overline={FORGOT_TEXT.overline}
      title={FORGOT_TEXT.title}
      sub={FORGOT_TEXT.sub}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
