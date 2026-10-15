"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { Analytics } from "firebase/analytics";
import { redactAnalyticsUrl } from "@/lib/analytics";
import { useAnalyticsConsent } from "@/lib/analytics-consent";
import { firebaseWebConfig } from "@/lib/firebase";

/**
 * Google Analytics through Firebase, rendered once from the root layout. P1.
 *
 * OFF UNTIL THE VISITOR SAYS YES. With no answer, or a "no", the Firebase SDK is never
 * downloaded and Google gets nothing. The answer comes from AnalyticsConsentBanner or the
 * switch on 2.5.9 (lib/analytics-consent.ts). With no NEXT_PUBLIC_FIREBASE_* config this
 * renders nothing at all (lib/firebase.ts).
 *
 * Once allowed, Google sees the same redacted page that Vercel does (lib/analytics.ts):
 * - Firebase's own page_view is off. We send one per route with `page_location` and
 *   `page_title` set from the redacted URL, and set them as defaults so any automatic event
 *   (scroll, outbound click) carries the redacted page too, not `document.location`.
 *   `page_title` is the redacted path because a document title can name a trip.
 * - The referrer is cut to its origin: which site sent someone, not which page.
 * - `/agent/*` switches collection off while it is open, and the SDK is never started there.
 * - Google signals and ad personalization are off, and we never call setUserId.
 *
 * Turning it off later stops collection and deletes the `_ga` cookies Google set.
 *
 * web/content/public/legal/privacy.ts and cookies.ts describe all of this. Change one and
 * the others must change too.
 */
export function FirebaseAnalytics() {
  const consent = useAnalyticsConsent();
  const pathname = usePathname();

  useEffect(() => {
    if (consent === undefined) return;
    if (consent !== "granted") {
      void stop();
      return;
    }
    const page = redactAnalyticsUrl(window.location.href);
    if (page === null) {
      void pause();
      return;
    }
    void track(page);
  }, [consent, pathname]);

  return null;
}

type FirebaseAnalyticsModule = typeof import("firebase/analytics");

let started: Promise<{ sdk: FirebaseAnalyticsModule; analytics: Analytics } | null> | null = null;

function start() {
  started ??= (async () => {
    const config = firebaseWebConfig();
    if (!config) return null;
    const [{ initializeApp, getApps }, sdk] = await Promise.all([
      import("firebase/app"),
      import("firebase/analytics"),
    ]);
    if (!(await sdk.isSupported())) return null;
    const app = getApps()[0] ?? initializeApp(config);
    const analytics = sdk.initializeAnalytics(app, {
      config: {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    });
    return { sdk, analytics };
  })().catch(() => null);
  return started;
}

async function track(page: string) {
  // Defaults first, so nothing the SDK sends on start-up carries the raw location.
  const { setDefaultEventParameters } = await import("firebase/analytics");
  setDefaultEventParameters({
    page_location: page,
    page_title: new URL(page).pathname,
    page_referrer: referrerOrigin(),
  });
  const ready = await start();
  if (!ready) return;
  ready.sdk.setAnalyticsCollectionEnabled(ready.analytics, true);
  ready.sdk.logEvent(ready.analytics, "page_view", {
    page_location: page,
    page_title: new URL(page).pathname,
  });
}

/** On /agent: collection off if it ever started, and never started from here. */
async function pause() {
  if (!started) return;
  const ready = await started;
  if (ready) ready.sdk.setAnalyticsCollectionEnabled(ready.analytics, false);
}

/** Consent withdrawn (or never given): collection off and Google's cookies gone. */
async function stop() {
  await pause();
  clearGoogleAnalyticsCookies();
}

function referrerOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "";
  } catch {
    return "";
  }
}

/**
 * Google sets `_ga` and `_ga_<id>` on the widest domain it can, so expire each name on this
 * host and on every parent domain. A path or domain that does not match is a no-op.
 */
function clearGoogleAnalyticsCookies() {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
  if (names.length === 0) return;

  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}
