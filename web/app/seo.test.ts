import { describe, expect, it, vi } from "vitest";
import { LEGAL_SLUGS } from "@/content/public/legal";
import { TRIP_SLUGS } from "@/content/public/trips";
import { env } from "@/lib/env";
import robots from "./robots";
import { CONTENT_UPDATED, publicSitemap, ROBOTS_DISALLOW, STATIC_PUBLIC_PATHS } from "./seo";
import sitemap from "./sitemap";

// next/og pulls in a wasm rasteriser; the test only needs the module's exports and the call shape.
vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse {
    constructor(
      readonly element: unknown,
      readonly options: unknown,
    ) {}
  },
}));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it("emits absolute URLs on the configured origin, each exactly once", () => {
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${env.siteUrl}/`)).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lists every static page, every trip and every legal document", () => {
    for (const path of STATIC_PUBLIC_PATHS) expect(urls).toContain(`${env.siteUrl}${path}`);
    for (const slug of TRIP_SLUGS) expect(urls).toContain(`${env.siteUrl}/explore/${slug}`);
    for (const slug of LEGAL_SLUGS) expect(urls).toContain(`${env.siteUrl}/legal/${slug}`);
    expect(entries).toHaveLength(STATIC_PUBLIC_PATHS.length + TRIP_SLUGS.length + LEGAL_SLUGS.length);
  });

  it("leaves out the noindex pages and the auth screens", () => {
    for (const path of ["/explore/results", "/join", "/login", "/register", "/forgot-password", "/dashboard"]) {
      expect(urls).not.toContain(`${env.siteUrl}${path}`);
      expect(urls.some((url) => url.startsWith(`${env.siteUrl}${path}?`))).toBe(false);
    }
  });

  it("stamps content dates, never the build clock", () => {
    expect(CONTENT_UPDATED).toMatch(ISO_DATE);
    for (const entry of entries) expect(String(entry.lastModified)).toMatch(ISO_DATE);
  });

  it("builds from whatever origin it is given", () => {
    const [home] = publicSitemap("https://app.example.test");
    expect(home.url).toBe("https://app.example.test/");
    expect(home.priority).toBe(1);
  });
});

describe("robots", () => {
  const result = robots();

  it("allows everything except the auth-gated trees", () => {
    expect(result.rules).toEqual({ userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] });
    expect(ROBOTS_DISALLOW).toEqual(["/dashboard", "/trips", "/account", "/agent", "/auth/", "/api/"]);
  });

  it("does not block the noindex pages — crawlers must fetch them to see the noindex", () => {
    for (const path of ["/", "/join", "/explore", "/explore/results", "/legal/privacy"]) {
      expect(ROBOTS_DISALLOW).not.toContain(path);
    }
  });

  it("points at the sitemap on the same origin", () => {
    expect(result.sitemap).toBe(`${env.siteUrl}/sitemap.xml`);
  });
});

describe("opengraph image", () => {
  it("declares a 1200×630 PNG with alt text and renders through ImageResponse", async () => {
    const mod = await import("./opengraph-image");
    const { ImageResponse } = await import("next/og");
    expect(mod.size).toEqual({ width: 1200, height: 630 });
    expect(mod.contentType).toBe("image/png");
    expect(mod.alt).toContain("Story-Tail Adventures");
    const image = mod.default();
    expect(image).toBeInstanceOf(ImageResponse);
    // Sized from the exported `size`, so the meta tags and the PNG can never disagree.
    expect((image as unknown as { options: unknown }).options).toEqual(mod.size); // mocked class above
  });
});
