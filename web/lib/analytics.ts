import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * `beforeSend` for Vercel Web Analytics (components/VercelAnalytics.tsx). P1.
 *
 * Vercel only ever sees a page view's URL, so this is the whole privacy boundary:
 *
 * - **The agent surface is dropped.** `/agent/*` is Gyasi working his own CRM. Counting it
 *   would mix one person's workday into the visitor numbers, and its URLs carry client
 *   data: the roster search puts a client's name in `?q=`.
 * - **Query strings are stripped, except `utm_*`.** Search pages and filters put free text
 *   on the URL, and nothing we read in the dashboard needs it. Campaign tags are the one
 *   exception, since telling where people came from is the point.
 * - **The hash is stripped.** An implicit-flow auth redirect would carry tokens there.
 * - **Record ids in the path become `[id]`.** `/trips/<uuid>` names one traveler's trip, and
 *   we can look that up even if Vercel cannot. The `<Analytics />` component reports the
 *   route pattern (`/trips/[tripId]`) on its own, so the dashboard loses nothing. Slugs such as
 *   `/legal/cookies` are not ids and stay.
 *
 * web/content/public/legal/privacy.ts describes these rules to travelers. Change one and the
 * other must change too.
 *
 * A URL that will not parse is dropped rather than sent as-is.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }

  if (url.pathname === "/agent" || url.pathname.startsWith("/agent/")) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (!key.startsWith("utm_")) url.searchParams.delete(key);
  }
  url.hash = "";
  url.pathname = url.pathname
    .split("/")
    .map((segment) => (UUID.test(segment) ? "[id]" : segment))
    .join("/");

  return { ...event, url: url.toString() };
}
