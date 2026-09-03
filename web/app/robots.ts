import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { publicRobots } from "./seo";

/** /robots.txt — rules and rationale in app/seo.ts. Default export only (see that file). */
export default function robots(): MetadataRoute.Robots {
  return publicRobots(env.siteUrl);
}
