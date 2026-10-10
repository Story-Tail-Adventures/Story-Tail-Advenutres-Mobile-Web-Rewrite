import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * `beforeSend` for Vercel Web Analytics (components/VercelAnalytics.tsx). P1.
 *
 * Vercel only ever sees a page view's URL, so this is the whole privacy boundary:
 *
 * - **The agent surface is dropped.** `/agent/*` is Gyasi working his own CRM. Counting it
 *   would mix one person's workday into the visitor numbers, and its URLs carry client
 *   data — the roster search puts a client's name in `?q=`.
 * - **Query strings are stripped, except `utm_*`.** Search pages and filters put free text
 *   on the URL, and nothing we read in the dashboard needs it. Campaign tags are the one
 *   exception, since telling where people came from is the point.
 * - **The hash is stripped.** An implicit-flow auth redirect would carry tokens there.
 *
 * Path segments stay. They hold UUIDv7 ids, which name a row without saying anything about
 * the person, and the `<Analytics />` component reports the route pattern beside them.
 *
 * A URL that will not parse is dropped rather than sent as-is.
 */
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

  return { ...event, url: url.toString() };
}
