"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactAnalyticsEvent } from "@/lib/analytics";

/**
 * Vercel Web Analytics, rendered once from the root layout. P1.
 *
 * A client module only because `beforeSend` is a function, and the root layout is a Server
 * Component that cannot hand one across the boundary. What gets redacted, and why, is in
 * lib/analytics.ts.
 *
 * Nothing is counted until Web Analytics is enabled on the Vercel project; until then the
 * script request 404s quietly. In `next dev` it runs in debug mode and only logs.
 */
export function VercelAnalytics() {
  return <Analytics beforeSend={redactAnalyticsEvent} />;
}
