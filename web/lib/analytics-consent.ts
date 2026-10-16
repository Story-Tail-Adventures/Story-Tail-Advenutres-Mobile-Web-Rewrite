"use client";

import { useSyncExternalStore } from "react";

/**
 * The visitor's answer to "may Google Analytics count this visit?". P1.
 *
 * Google Analytics sets cookies and sends data to Google, so unlike Vercel's cookieless
 * count it waits for a yes. Until there is one, the Firebase SDK is not even downloaded
 * (components/FirebaseAnalytics.tsx imports it lazily).
 *
 * Stored per browser in localStorage, like the theme and the dismissed sign-in banner, so
 * a public page never has to read a cookie and turn dynamic. A signed-in traveler sees the
 * same answer on 2.5.9 and can change it there.
 *
 * Three states: "granted", "denied", or null for "not asked yet". The server snapshot is
 * `undefined` — not known — so nothing that depends on the answer renders until hydration.
 */
export type AnalyticsConsent = "granted" | "denied";

export const ANALYTICS_CONSENT_KEY = "sta-analytics-consent";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/**
 * A FAILED WRITE STILL COUNTS FOR THIS PAGE. Storage throws in a private window; the answer
 * holds until the next load and the banner asks again then. Same call DismissibleBanner makes.
 */
export function writeAnalyticsConsent(value: AnalyticsConsent) {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    memory = value;
  }
  listeners.forEach((l) => l());
}

/** The fallback for a blocked localStorage, so a click still takes effect on this page. */
let memory: AnalyticsConsent | null = null;

export function useAnalyticsConsent(): AnalyticsConsent | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => readAnalyticsConsent() ?? memory,
    () => undefined,
  );
}
