// Screen 2.1.1 Login — see docs/Screen-Inventory.md §2.1.1 and
// design/source-prototype/screens/client-auth.jsx (C211_Login).
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { env } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to see your trips.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <AuthCard
      overline="WELCOME BACK"
      title="Sign in"
      sub={
        <>
          New traveler?{" "}
          <Link href="/register" className="font-semibold text-primary">
            Create your account
          </Link>
          .
        </>
      }
      footer={
        <>
          By signing in you agree to our{" "}
          <Link href="/legal/terms" className="text-primary">
            terms
          </Link>{" "}
          &amp;{" "}
          <Link href="/legal/privacy" className="text-primary">
            privacy policy
          </Link>
          .
        </>
      }
    >
      <LoginForm
        next={next}
        googleEnabled={env.googleAuthEnabled}
        appleEnabled={env.appleAuthEnabled}
      />
    </AuthCard>
  );
}
