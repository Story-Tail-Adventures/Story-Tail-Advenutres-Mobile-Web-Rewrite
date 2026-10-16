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
    ];
  },
};

export default nextConfig;
