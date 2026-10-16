/**
 * Copy for Screen 2.5.9 Privacy & Data. Pinned against `PrivacyMessages` by check_copy_parity.py.
 *
 * `trackingBody` must stay consistent with web/content/public/legal/cookies.ts, which says
 * "We do not use advertising cookies", lists the anonymous Vercel page-view count
 * (web/lib/analytics.ts), and lists Google Analytics as opt-in on the website only
 * (components/FirebaseAnalytics.tsx). It is shared with the app, which runs no analytics,
 * so it must stay true on both. If a tracker is added or changed, BOTH change in the same commit — a privacy claim that drifts from the legal page is worse
 * than no claim.
 *
 * `exportBody` names only what the client can actually read back. It deliberately does NOT
 * mention the document-access trail: that lives in `audit_event`, which is the agency's.
 */
export const PRIVACY = {
  title: "Privacy & data",
  subtitle: "What we hold, and what we don’t.",

  exportTitle: "Download your data",
  exportBody:
    "Your profile, your trips, your documents and your messages. It is yours; take a copy whenever you like.",
  exportCta: "Request an export",
  exportDeferred: "Coming with the next release",

  trackingHeading: "TRACKING",
  trackingBody:
    "We don’t run advertising trackers. The website counts page views anonymously, without cookies. If you allow it on the website, Google Analytics counts visits too and sets a few cookies of its own. The only other cookies are the ones that keep you signed in, and you can clear any of them in your browser.",
  cookiesLink: "Read the cookie policy",

  closeTitle: "Close your account",
  closeBody:
    "Your trips are archived and your personal details are anonymized. Some records have to be kept for tax reasons — we will show you exactly which before you confirm.",
  closeCta: "Close my account",
} as const;
