import Link from "next/link";

import { Icon } from "@/components/ui/Icon";

/**
 * The back bar every §2.5 sub-screen carries. 2.5.1 is the Account destination's root and
 * everything else is pushed on top of it, so each sub-screen needs a way back that is not
 * the rail — the rail's Account item is already "active" on all of them.
 *
 * A server component: it renders a Link, never a handler.
 */
export function AccountHeader({
  title,
  sub,
  backHref = "/account",
  backLabel = "Account",
  actions,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-outline-variant bg-surface-1">
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <Link
          href={backHref}
          className="t-body-s inline-flex items-center gap-1 text-on-surface-variant"
        >
          <Icon name="arrow_left" size={14} /> {backLabel}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="t-headline">{title}</h1>
            {sub && <p className="t-body-s text-on-surface-variant">{sub}</p>}
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}
