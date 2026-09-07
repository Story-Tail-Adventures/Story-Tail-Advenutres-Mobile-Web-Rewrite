import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/icon-paths";
import { cn } from "@/lib/cn";

/**
 * The four cross-cutting states Screen Inventory §5 requires of EVERY screen, as one set
 * of primitives rather than eleven hand-written variants.
 *
 * Four states x eleven screens x two stacks is 88 implementations, and that is exactly how
 * they drift: the loading state on one screen grows a spinner, the error on another forgets
 * the escalation path, and nothing fails. So they are shell infrastructure here, and the
 * Compose equivalent is `Loadable<T>` in the shared module.
 *
 * §5's specific requirements, each of which is load-bearing:
 *   * Loading — "skeleton placeholders that match the screen's layout ... avoid
 *     spinner-on-blank". Hence Skeleton takes a shape, not a size.
 *   * Empty — a branded illustration, a one-line explanation, and a CTA.
 *   * Error — plain language, never a stack trace, a retry, AND a "Message Gyasi"
 *     escalation as the fallback path.
 *   * Unauthorized — "You don't have access to this view" with the right redirect. This one
 *     is not decorative: without it an AGENT who reaches a client route gets zero rows from
 *     RLS and sees the friendly empty state, which reads as "you have no trips" rather than
 *     "this is not your view".
 *
 * Inline error colour is `md.error`, per §5's September 2026 correction — the old guidance
 * naming Tropical Orange for inline errors is dead.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("client-skeleton", className)} aria-hidden="true" />;
}

/** A screen-shaped skeleton: a title, a hero block, and a few cards. */
export function ScreenSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-7 w-3/4 max-w-md" />
      {hero && <Skeleton className="mt-5 h-56 w-full rounded-xl" />}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "palm",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <Card className="mx-auto mt-6 max-w-lg p-7 text-center">
      <span
        className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-on-surface-variant"
        aria-hidden="true"
      >
        <Icon name={icon} size={26} />
      </span>
      <h2 className="t-title-l">{title}</h2>
      <p className="t-body mt-2 text-on-surface-variant">{body}</p>
      {action && (
        <Link href={action.href} className="btn btn-tonal mt-4">
          {action.label}
        </Link>
      )}
    </Card>
  );
}

/**
 * §5: plain language, no stack traces, a retry, and an escalation to a human.
 *
 * `reset` is Next's error-boundary reset. When it is absent — a server-rendered error page
 * rather than a boundary — the retry becomes a plain reload link, because a button that
 * does nothing is worse than no button.
 */
export function ErrorState({
  title = "That didn’t load",
  body = "Something went wrong on our side, not yours. Trying again usually sorts it.",
  reset,
}: {
  title?: string;
  body?: string;
  reset?: () => void;
}) {
  return (
    <Card className="mx-auto mt-6 max-w-lg p-7 text-center">
      <span
        className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-on-error-container"
        aria-hidden="true"
      >
        <Icon name="warning" size={26} />
      </span>
      <h2 className="t-title-l text-error">{title}</h2>
      <p className="t-body mt-2 text-on-surface-variant">{body}</p>
      <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
        {reset ? (
          <button type="button" className="btn btn-filled" onClick={reset}>
            Try again
          </button>
        ) : (
          <Link href="/dashboard" className="btn btn-filled">
            Back to your trips
          </Link>
        )}
        {/* The escalation path §5 asks for. It is a mailto until §2.6 lands the thread,
            for the same reason §2.0's guest inquiry is a mailto: the alternative is a
            form that goes nowhere. */}
        <a href="mailto:hello@story-tail.com?subject=Something%20went%20wrong" className="btn btn-outlined">
          <Icon name="message" size={14} /> Message Gyasi
        </a>
      </div>
    </Card>
  );
}

/**
 * §5's permissions state. Reached when a caller is authenticated but this is not their
 * view — in practice an agent landing on a client route.
 */
export function UnauthorizedState({
  redirectHref = "/login",
  redirectLabel = "Sign in as a traveler",
}: {
  redirectHref?: string;
  redirectLabel?: string;
}) {
  return (
    <Card className="mx-auto mt-6 max-w-lg p-7 text-center">
      <span
        className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 text-on-surface-variant"
        aria-hidden="true"
      >
        <Icon name="shield" size={26} />
      </span>
      <h2 className="t-title-l">You don’t have access to this view</h2>
      <p className="t-body mt-2 text-on-surface-variant">
        This is the traveler’s side of Story-Tail. Your account is set up as an advisor, so
        your work lives somewhere else.
      </p>
      <Link href={redirectHref} className="btn btn-tonal mt-4">
        {redirectLabel}
      </Link>
    </Card>
  );
}
