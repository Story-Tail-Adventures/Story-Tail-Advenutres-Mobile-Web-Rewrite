import { PlaceholderBanner } from "@/components/public/PlaceholderBanner";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SkipLink } from "@/components/public/SkipLink";

/**
 * Public (pre-auth) shell — Screen Inventory §2.0, Pattern H.
 *
 * Deliberately free of request-time APIs (no cookies(), headers() or auth lookups): that is
 * what lets every public page prerender as static HTML. The top bar lives in the nested
 * (hero) / (plain) layouts because they differ only in how it sits on the hero photo.
 * Signed-in visitors hitting `/` or `/join` are redirected by web/proxy.ts instead.
 */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="pub-surface flex min-h-dvh flex-1 flex-col bg-bg text-on-bg">
      <SkipLink />
      <PlaceholderBanner />
      {children}
      <PublicFooter />
    </div>
  );
}
