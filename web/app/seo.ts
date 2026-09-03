/**
 * Public-surface SEO data shared by app/robots.ts and app/sitemap.ts (Screen Inventory §2.0;
 * risk plan §SEO).
 *
 * Kept out of the route files on purpose: Next's metadata-route loader re-exports every named
 * export of `sitemap.ts` / `robots.ts` into a generated Route Handler, so those files export a
 * default function and nothing else. Helpers and constants live here and are unit-tested in
 * app/seo.test.ts.
 *
 * `lastModified` is always a content date, never the build clock — a sitemap that moves every
 * deploy tells crawlers everything changed when nothing did.
 */
import type { MetadataRoute } from "next";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { TRIPS } from "@/content/public/trips";
import { tripHref } from "@/lib/public/links";

/** Last edit to the copy of the static public pages (landing, how-it-works, about, topics, explore). */
export const CONTENT_UPDATED = "2026-09-02";

/**
 * Indexable static routes, in nav order. `/explore/results` and `/join` are noindex, and
 * `/login` / `/register` are auth screens, so none of them belong in the sitemap.
 */
export const STATIC_PUBLIC_PATHS = [
  "/",
  "/how-it-works",
  "/about",
  "/caribbean",
  "/cruises",
  "/honeymoons",
  "/explore",
] as const;

/**
 * Auth-gated trees crawlers should not enter (web/lib/supabase/middleware.ts PROTECTED_PREFIXES
 * plus the auth callback). The noindex pages are deliberately NOT here: a crawler has to be able
 * to fetch /join and /explore/results to see their `noindex`.
 */
export const ROBOTS_DISALLOW = ["/dashboard", "/trips", "/account", "/agent", "/auth/"] as const;

/** `base` is an origin with no trailing slash (env.siteUrl); `path` starts with "/". */
export function absoluteUrl(base: string, path: string): string {
  return `${base}${path}`;
}

export function publicSitemap(base: string): MetadataRoute.Sitemap {
  const statics = STATIC_PUBLIC_PATHS.map(
    (path): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(base, path),
      lastModified: CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: path === "/" ? 1 : 0.8,
    }),
  );
  const trips = TRIPS.map(
    (trip): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(base, tripHref(trip.slug)),
      lastModified: trip.priceAsOf,
      changeFrequency: "monthly",
      priority: 0.6,
    }),
  );
  const legal = LEGAL_SLUGS.map(
    (slug): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(base, `/legal/${slug}`),
      lastModified: LEGAL_DOCS[slug].lastUpdated,
      changeFrequency: "yearly",
      priority: 0.3,
    }),
  );
  return [...statics, ...trips, ...legal];
}

export function publicRobots(base: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] },
    sitemap: absoluteUrl(base, "/sitemap.xml"),
  };
}
