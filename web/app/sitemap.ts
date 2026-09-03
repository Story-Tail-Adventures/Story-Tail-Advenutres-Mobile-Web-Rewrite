import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { publicSitemap } from "./seo";

/** /sitemap.xml — every indexable public route with content-derived dates (app/seo.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemap(env.siteUrl);
}
