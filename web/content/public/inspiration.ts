import type { InspirationTile } from "./types";

/**
 * "Inspiration · curated" tiles on 2.0.3 Public Search Landing, in prototype order.
 * Counts shown on the tiles are derived from the catalog at render time, never typed here.
 */
export const INSPIRATION_TILES: readonly InspirationTile[] = [
  { slug: "caribbean-escapes", title: "Caribbean escapes", imageKey: "turks", query: { topic: "caribbean" } },
  { slug: "family-cruises", title: "Family cruises", imageKey: "cruiseShip", query: { type: "cruise", vibe: "family" } },
  { slug: "honeymoons", title: "Honeymoons", imageKey: "honeymoon", query: { topic: "honeymoons" } },
  { slug: "all-inclusive-resorts", title: "All-inclusive resorts", imageKey: "resortPool", query: { type: "all-inclusive" } },
  { slug: "adventure-travel", title: "Adventure travel", imageKey: "snorkel", query: { vibe: "adventure" } },
  { slug: "group-trips", title: "Group trips · 6+", imageKey: "overwater", query: { vibe: "group" } },
];
