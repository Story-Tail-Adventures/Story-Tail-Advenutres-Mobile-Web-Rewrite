// Screen 2.1.1 Login — see docs/Screen-Inventory.md §2.1.1 and
// design/source-prototype/screens/client-auth.jsx (C211_Login).
import type { Metadata } from "next";
import MuiLink from "@mui/material/Link";
import { AuthCard } from "@/components/auth/AuthCard";
import NextLink from "@/components/mui/NextLink";
import { authErrorFromParam } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { single, type SearchParams } from "@/lib/search-params";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to see your trips.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // Sanitised here as well as in the action. The action is what actually protects the
  // redirect; this keeps an unchecked value from reaching the hidden input, one refactor
  // away from being read by something that trusts it.
  const next = safeNext(single(params.next));
  // `startOAuthAction` redirects here with `?error=` when the provider handshake never
  // starts. Without this the kind was written into the URL and thrown away, so a failed
  // "Continue with Google" returned a bare sign-in form and no explanation.
  const initialError = authErrorFromParam(single(params.error));

  return (
    <AuthCard
      overline="WELCOME BACK"
      title="Sign in"
      sub={
        <>
          New traveler?{" "}
          <MuiLink component={NextLink} href="/register" sx={{ fontWeight: 600 }}>
            Create your account
          </MuiLink>
          .
        </>
      }
      footer={
        <>
          By signing in you agree to our{" "}
          <MuiLink component={NextLink} href="/legal/terms">
            terms
          </MuiLink>{" "}
          &amp;{" "}
          <MuiLink component={NextLink} href="/legal/privacy">
            privacy policy
          </MuiLink>
          .
        </>
      }
    >
      <LoginForm
        next={next}
        initialError={initialError}
        googleEnabled={env.googleAuthEnabled}
        appleEnabled={env.appleAuthEnabled}
      />
    </AuthCard>
  );
}
