import { describe, expect, it } from "vitest";
import { INSPIRATION_TILES } from "@/content/public/inspiration";
import { TRIPS } from "@/content/public/trips";
import { filterTrips, parseSearchParams, resultsHref } from "@/lib/public/search";
import { tileSearchQuery, tripCountLabel } from "./content";

describe("tileSearchQuery", () => {
  it("builds a complete SearchQuery for every inspiration tile", () => {
    for (const tile of INSPIRATION_TILES) {
      const q = tileSearchQuery(tile);
      expect(q.sort).toBe("best-fit");
      expect(q.budgets).toEqual([]);
      expect(q.types).toEqual(tile.query.type ? [tile.query.type] : []);
      expect(q.vibes).toEqual(tile.query.vibe ? [tile.query.vibe] : []);
      expect(q.topic).toBe(tile.query.topic);
    }
  });

  it("round-trips through the results URL", () => {
    for (const tile of INSPIRATION_TILES) {
      const q = tileSearchQuery(tile);
      const href = resultsHref(q);
      const back = parseSearchParams(new URLSearchParams(href.split("?")[1] ?? ""));
      expect(back).toEqual({ ...q, dest: q.dest, when: undefined, travelers: undefined });
    }
  });

  it("every tile leads to at least one trip in the catalog", () => {
    for (const tile of INSPIRATION_TILES) {
      expect(filterTrips(TRIPS, tileSearchQuery(tile)).length).toBeGreaterThan(0);
    }
  });
});

describe("tripCountLabel", () => {
  it("pluralises", () => {
    expect(tripCountLabel(1)).toBe("1 trip");
    expect(tripCountLabel(0)).toBe("0 trips");
    expect(tripCountLabel(12)).toBe("12 trips");
  });
});
