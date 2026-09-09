"use client";

import { useSyncExternalStore } from "react";

import { hasAuthFlag } from "./chrome-flag";
import { INITIALS_FALLBACK } from "./initials";

/**
 * Whether to draw the signed-in chrome on a public page, and the letters to draw in it.
 *
 * A tiny external store read through useSyncExternalStore, the same shape as
 * components/public/DismissibleBanner.tsx, with one difference that matters: the snapshot is
 * an object, so `getSnapshot` MUST hand back a cached reference. Building `{ status, initials }`
 * per call trips React's "getSnapshot should be cached" warning and re-renders forever. The
 * cookie is therefore read in `subscribe` and on wake, never in `getSnapshot`.
 *
 * `getServerSnapshot` returns "unknown", and React uses it for SSR AND for the hydration
 * render — so the server HTML and the first client render agree and there is no hydration
 * error. The pre-paint script (components/AuthChromeScript.tsx) is what makes that first
 * frame look right: while the status is "unknown" the markup carries both states and CSS
 * picks one.
 *
 * Nothing here imports the Supabase SDK. That is deliberate — it would put ~265KB of
 * auth-js on every marketing page and start a token-refresh ticker racing the proxy's.
 */

export type AuthChromeStatus = "unknown" | "out" | "in";

export interface AuthChrome {
  status: AuthChromeStatus;
  /** Empty means "signed in, letters not back yet" — draw an empty circle, not a monogram. */
  initials: string;
}

const UNKNOWN: AuthChrome = { status: "unknown", initials: "" };
const SIGNED_OUT: AuthChrome = { status: "out", initials: "" };

let snapshot: AuthChrome = UNKNOWN;
const listeners = new Set<() => void>();

/** The flag value the current snapshot was derived from, so a wake-up can skip a no-op. */
let lastFlag: boolean | null = null;
let watching = false;

function publish(next: AuthChrome) {
  if (next.status === snapshot.status && next.initials === snapshot.initials) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function getSnapshot(): AuthChrome {
  return snapshot;
}

function getServerSnapshot(): AuthChrome {
  return UNKNOWN;
}

/**
 * The flag says whether to draw an avatar; this says what goes in it.
 *
 * A failed request keeps the avatar and falls back to the brand monogram: the flag is
 * getUser()-backed, so "signed in" is not in doubt just because one fetch lost. A response of
 * `signedIn: false` IS authoritative, though — that is a stale flag cookie (they outlive
 * their token by design), and the honest thing is to show the sign-in links again.
 */
let loading = false;

async function loadInitials(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/api/account/chrome", { credentials: "same-origin" });
    if (!response.ok) {
      publish({ status: "in", initials: INITIALS_FALLBACK });
      return;
    }
    const data: unknown = await response.json();
    const signedIn = typeof data === "object" && data !== null && "signedIn" in data && data.signedIn === true;
    if (!signedIn) {
      lastFlag = false;
      publish(SIGNED_OUT);
      return;
    }
    const initials =
      typeof data === "object" && data !== null && "initials" in data && typeof data.initials === "string"
        ? data.initials
        : "";
    publish({ status: "in", initials: initials || INITIALS_FALLBACK });
  } catch {
    publish({ status: "in", initials: INITIALS_FALLBACK });
  } finally {
    loading = false;
  }
}

/**
 * `force` re-verifies even when the flag has not changed, and is what the wake-up path
 * passes. The flag is a boolean, so it cannot tell "still signed in" from "signed in as
 * somebody else now" — a tab left open while another one switches accounts would otherwise
 * keep the first person's initials indefinitely, because `loadInitials` never fired again.
 * Mount does NOT force: every island on the page subscribes, and forcing there would be one
 * request per island instead of one per page.
 */
function resolve(options?: { force?: boolean }): void {
  const flag = hasAuthFlag();
  const changed = flag !== lastFlag;
  if (!changed && !options?.force) return;
  lastFlag = flag;

  if (!flag) {
    publish(SIGNED_OUT);
    return;
  }

  // Draw the avatar immediately — the flag alone is enough for that — and let the letters
  // arrive. The circle is a fixed size, so filling it in shifts nothing.
  if (changed) publish({ status: "in", initials: snapshot.initials });
  // Cheap to repeat: the endpoint answers `private, max-age=60`, so a refocus loop is served
  // from the browser's own cache, and `loading` collapses a burst into one request.
  void loadInitials();
}

/**
 * Signing out in another tab clears the flag cookie for this one too, but nothing tells this
 * page. Re-read it when the visitor comes back to the tab, which is the first moment a wrong
 * answer would be seen.
 */
function watch(): void {
  if (watching) return;
  watching = true;
  const onWake = () => resolve({ force: true });
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  watch();
  resolve();
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthChrome(): AuthChrome {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test seam: the store is module state, so a test that changes cookies must reset it. */
export function resetAuthChromeForTests(): void {
  snapshot = UNKNOWN;
  lastFlag = null;
  loading = false;
  listeners.clear();
}
