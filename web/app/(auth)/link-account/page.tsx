// Screen 2.1.8 Social Login / Account Linking — see docs/Screen-Inventory.md §2.1.8
// (Pattern J, §4.4) and design/source-prototype/screens/client-auth.jsx `C218_LinkAccount`
// + client-auth-mobile.jsx `M218_LinkAccount`. P1.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { isOAuthProvider } from "@/lib/auth/providers";
import type { SearchParams } from "@/lib/search-params";
import { LinkAccountForm } from "./LinkAccountForm";
import { LINK_TEXT } from "./state";

export const metadata: Metadata = {
  title: LINK_TEXT.metaTitle,
  description: LINK_TEXT.metaDescription,
  robots: { index: false, follow: false },
};

/**
 * Reached from /auth/callback when an OAuth sign-in collides with an existing email
 * account (§2.1.8 entry point). The provider travels in the URL because it is not personal
 * data. The address does not travel at all — an email in a query string lands in browser
 * history, in the next request's Referer header, and in every access log on the way — and
 * the form has to ask for it regardless: GoTrue's error redirect does not report which
 * address collided.
 *
 * An unrecognised or missing provider 404s rather than guessing one. There is no sensible
 * default: "link Google" and "link Apple" are different promises, and this screen asks
 * someone for their password on the strength of the one it names.
 */
export default async function LinkAccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const provider = params.provider;

  if (!isOAuthProvider(provider)) notFound();

  return (
    <AuthCard overline={LINK_TEXT.overline} title={LINK_TEXT.title} sub={LINK_TEXT.sub}>
      <LinkAccountForm provider={provider} />
    </AuthCard>
  );
}
