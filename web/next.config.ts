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
};

export default nextConfig;
