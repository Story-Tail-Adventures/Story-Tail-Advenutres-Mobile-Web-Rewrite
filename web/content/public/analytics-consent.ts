/**
 * Copy for the Google Analytics consent banner (components/AnalyticsConsentBanner.tsx) and
 * the matching switch on 2.5.9. Web only: the native app runs no analytics. P1.
 *
 * Every sentence is a privacy claim bound to components/FirebaseAnalytics.tsx and to
 * content/public/legal/cookies.ts and privacy.ts. Change the behavior and this changes too.
 *
 * Both answers are offered with the same weight. A yes that was nudged is not a yes.
 */
export const ANALYTICS_CONSENT = {
  bannerLabel: "Google Analytics",
  bannerBody:
    "May we count your visit with Google Analytics? It sets a few cookies and helps us see which pages help people most. Google’s ad features are off, and you can change your mind any time on your privacy page.",
  allow: "Allow",
  decline: "No thanks",
  cookiesLink: "Cookie policy",

  switchLabel: "Google Analytics",
  switchSub: "Counts visits with a few cookies so we can see what to improve. Off unless you turn it on.",
} as const;
