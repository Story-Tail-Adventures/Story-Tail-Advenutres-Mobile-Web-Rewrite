"use client";

import { ErrorState } from "@/components/client/states";

/**
 * The root error boundary.
 *
 * There was none before §2.2, and the gap had teeth: a Next error boundary does NOT catch
 * errors thrown by its own segment's layout, only by the segments below it. So an
 * unguarded `supabase.auth.getUser()` in `(client)/layout.tsx` — a Supabase outage, a
 * cold-start timeout — produced Next's own unstyled error page, which is a white screen
 * with a stack trace on it. Screen Inventory §5 forbids exactly that: "never expose stack
 * traces".
 *
 * A route-level `error.tsx` inside (client) would not have helped for the same reason.
 * This one, at the root, is above every layout that can throw.
 *
 * `global-error.tsx` is deliberately NOT added alongside it. That one replaces the entire
 * document including <html>, so it cannot use the app's fonts or theme script and would
 * render unstyled — and it only fires for errors in the ROOT layout, which does nothing
 * but set metadata and render a theme script.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The digest is the only safe thing to surface: it correlates with the server log without
  // carrying the message, which may name a table or quote a row.
  return (
    <div className="client-surface p-4">
      <ErrorState reset={reset} />
      {error.digest && (
        <p className="t-body-s mt-4 text-center text-on-surface-variant">
          Reference <span className="kbd">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
