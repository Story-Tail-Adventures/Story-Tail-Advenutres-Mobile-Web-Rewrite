import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/ui/icon-paths";
import { isImageKey, staImg, unsplashLoader } from "@/lib/images";
import { INSPIRATION_TILES } from "./inspiration";
import { ISLANDS } from "./islands";
import { LEGAL_DOCS, LEGAL_SLUGS } from "./legal";
import { TRIP_REVIEWS } from "./proof";
import { TRIPS } from "./trips";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("curated catalog invariants", () => {
  it("has unique, URL-safe slugs", () => {
    const slugs = TRIPS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("references only registered images and icons", () => {
    for (const t of TRIPS) {
      expect(isImageKey(t.imageKey)).toBe(true);
      if (t.heroImageKey) expect(isImageKey(t.heroImageKey)).toBe(true);
      for (const h of t.highlights) expect(ICON_NAMES).toContain(h.icon);
    }
    for (const i of ISLANDS) expect(isImageKey(i.imageKey)).toBe(true);
    for (const tile of INSPIRATION_TILES) expect(isImageKey(tile.imageKey)).toBe(true);
  });

  it("stores money as integer cents in USD with an ISO as-of date (CLAUDE.md rule 5)", () => {
    for (const t of TRIPS) {
      expect(Number.isInteger(t.from.amountCents)).toBe(true);
      expect(t.from.amountCents).toBeGreaterThan(0);
      expect(t.from.currency).toBe("USD");
      expect(t.priceAsOf).toMatch(ISO_DATE);
    }
  });

  it("never hard-codes a dollar figure in copy", () => {
    for (const t of TRIPS) {
      const text = [t.name, t.tagline, t.overline, t.description, t.priceNote, ...t.sampleItinerary, ...t.highlights.map((h) => h.text)].join(" ");
      expect(text).not.toMatch(/\$\d/);
    }
  });

  it("matches the prototype's tile counts per topic with unique positions", () => {
    const expected = { caribbean: 9, cruises: 9, honeymoons: 6 } as const;
    for (const [topic, count] of Object.entries(expected) as [keyof typeof expected, number][]) {
      const placed = TRIPS.filter((t) => t.topics[topic]);
      expect(placed.length).toBe(count);
      const orders = placed.map((t) => t.topics[topic]!.order);
      expect(new Set(orders).size).toBe(count);
      expect(Math.max(...orders)).toBe(count);
    }
  });

  it("gives every trip detail-page content", () => {
    for (const t of TRIPS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.highlights.length).toBe(4);
      expect(t.sampleItinerary.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps review figures attached to real trips", () => {
    for (const slug of Object.keys(TRIP_REVIEWS)) {
      expect(TRIPS.some((t) => t.slug === slug)).toBe(true);
    }
  });
});

describe("images", () => {
  it("builds Unsplash URLs with the expected parameters", () => {
    const url = new URL(staImg("turks", 1200, 630));
    expect(url.host).toBe("images.unsplash.com");
    expect(url.searchParams.get("w")).toBe("1200");
    expect(url.searchParams.get("h")).toBe("630");
    expect(url.searchParams.get("fit")).toBe("crop");
    const loaded = new URL(unsplashLoader({ src: "photo-abc", width: 640, quality: 75 }));
    expect(loaded.pathname).toBe("/photo-abc");
    expect(loaded.searchParams.get("w")).toBe("640");
    expect(loaded.searchParams.get("q")).toBe("75");
  });
});

describe("legal documents", () => {
  it("cover the four Screen Inventory 2.0.7 pages with dated sections", () => {
    expect(LEGAL_SLUGS).toEqual(["privacy", "terms", "cookies", "accessibility"]);
    for (const slug of LEGAL_SLUGS) {
      const doc = LEGAL_DOCS[slug];
      expect(doc.slug).toBe(slug);
      expect(doc.lastUpdated).toMatch(ISO_DATE);
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });
});
