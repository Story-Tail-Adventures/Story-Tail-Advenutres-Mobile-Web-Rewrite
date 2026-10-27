import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /*
     * Public-page photography is Unsplash placeholder imagery keyed in web/lib/images.ts.
     * A global custom loader lets Unsplash's CDN do the resizing (no /_next/image proxying,
     * no remotePatterns) and keeps Server Components free of function props. Owned assets
     * under /public pass straight through — see web/lib/image-loader.ts.
     */
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",
  },
  async headers() {
    return [
      {
        // §3.10 Stage 4: the opt-out link carries a per-person token in its URL. The page's meta
        // tag already says no-referrer; the header covers anything that loads before it.
        source: "/email/unsubscribe",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        /*
         * Screen 2.0.4 is the one public page that cannot be prerendered: its whole state is
         * the query string, so every chip, sort and mode link is a distinct render. That is
         * what a crawler walked for 55K requests and 2.3 GB in twelve hours on 2026-10-17
         * (app/seo.ts), and in Hotels mode a distinct key also spends a metered provider
         * request out of 250 a month.
         *
         * robots.txt now disallows it and the proxy no longer runs on it, but neither helps
         * a bot that ignores robots.txt. Shared caching does: a repeat walk of the same URLs
         * is served by the CDN without reaching a function or the provider. It is safe to
         * cache publicly because the rendered HTML carries no identity — the signed-in
         * chrome is decided in the browser from a cookie, which is exactly why
         * app/(public)/layout.tsx reads no request-time APIs.
         *
         * An hour matches the revalidate on the other public pages.
         */
        source: "/explore/results",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
