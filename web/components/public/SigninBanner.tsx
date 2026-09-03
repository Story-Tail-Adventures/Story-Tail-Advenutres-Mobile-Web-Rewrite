import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { DismissibleBanner } from "./DismissibleBanner";

/**
 * "Sign in or create an account to save…" band on the public search pages (design: C203;
 * Screen Inventory §4.4: top banner with dismiss on tablet/web, sticky strip on mobile —
 * the mobile strip is the page's StickyCta, so this renders from `md` only).
 */
export function SigninBanner({ next }: { next: string }) {
  return (
    <DismissibleBanner storageKey="sta-public-banner" className="hidden md:block">
      <div className="pub-container pub-container-wide flex items-center gap-2.5 border-b border-outline-variant bg-warning-container py-3.5 text-on-surface">
        <Icon name="info" size={16} className="shrink-0" />
        <p className="t-body-s">
          <b>Sign in or create an account</b> to save searches, favorite trips, and request a real proposal.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-text btn-sm">
            Sign in
          </Link>
          <Link href="/join" className="btn btn-filled btn-sm">
            Create account
          </Link>
        </div>
      </div>
    </DismissibleBanner>
  );
}
