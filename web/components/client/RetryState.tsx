"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ErrorState } from "./states";

/**
 * §5's error state with a retry that actually retries.
 *
 * WHY THIS EXISTS. The §2.2 reads FAIL CLOSED: a repository that cannot read returns null
 * rather than throwing, because an empty state would tell a traveler they have no trips —
 * a lie that looks like data loss. But a returned null never reaches a route-level
 * `error.tsx` boundary, so the screens handled it inline, and they handled it with
 * `EmptyState` — which has no retry and no escalation. §5 asks for both.
 *
 * `ErrorState` already carries the escalation and takes a `reset` callback, and a callback
 * is a client boundary, which a server component cannot supply. Hence this wrapper: the
 * smallest client component that can hand `router.refresh()` down. A plain `<Link>` back to
 * the same path was the cheaper option and the wrong one — the client router can serve that
 * from cache and the traveler taps "Try again" to no effect.
 */
export function RetryState({ title, body }: { title?: string; body?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <ErrorState
      title={title}
      body={body}
      reset={() => {
        if (pending) return;
        // `refresh()` re-runs the server component and its reads without discarding the
        // rest of the client state — which for these screens is nothing, but it is also
        // the only refetch that does not flash the whole shell.
        startTransition(() => router.refresh());
      }}
    />
  );
}
