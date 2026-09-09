import { describe, expect, it } from "vitest";
import { STA_IMAGES } from "@/lib/images";
import { imageKeyForTrip } from "./imagery";

const trip = (over: Partial<Parameters<typeof imageKeyForTrip>[0]> = {}) => ({
  id: "0195a2c0-1a00-7000-8000-000000000040",
  tripType: "all_inclusive",
  destinations: [] as string[],
  ...over,
});

describe("imageKeyForTrip", () => {
  it("always returns a key the registry actually holds", () => {
    const types = ["cruise", "all_inclusive", "multi_destination", "group", "custom", "weird"];
    for (const tripType of types) {
      for (const dest of [[], ["Negril, Jamaica"], ["Nowhere"]]) {
        const key = imageKeyForTrip(trip({ tripType, destinations: dest }));
        expect(STA_IMAGES).toHaveProperty(key);
      }
    }
  });

  it("prefers the destination over the trip type", () => {
    // Somebody going to Negril should see Jamaica, not a generic resort pool.
    expect(imageKeyForTrip(trip({ destinations: ["Negril, Jamaica"] }))).toBe("jamaica");
    expect(imageKeyForTrip(trip({ tripType: "cruise", destinations: ["Nassau, Bahamas"] }))).toBe(
      "bahamas",
    );
  });

  it("matches the destinations the seed and catalog actually use", () => {
    const cases: Array<[string, string]> = [
      ["Providenciales, Turks & Caicos", "turks"],
      ["Palm Beach, Aruba", "aruba"],
      ["Montego Bay", "jamaica"],
      ["Soufrière, St Lucia", "stlucia"],
      ["Tortola, British Virgin Islands", "bvi"],
    ];
    for (const [dest, expected] of cases) {
      expect(imageKeyForTrip(trip({ destinations: [dest] }))).toBe(expected);
    }
  });

  it("falls back to the trip type when the destination is unknown", () => {
    expect(imageKeyForTrip(trip({ tripType: "cruise", destinations: ["Antarctica"] }))).toBe(
      "cruiseShip",
    );
    expect(imageKeyForTrip(trip({ tripType: "group", destinations: [] }))).toBe("family");
  });

  it("is stable for the same id, so a card does not change picture between renders", () => {
    const t = trip({ tripType: "unknown", destinations: [] });
    const first = imageKeyForTrip(t);
    for (let i = 0; i < 20; i += 1) expect(imageKeyForTrip(t)).toBe(first);
  });

  it("spreads different ids across the fallback pool", () => {
    // Not a uniformity guarantee — just that the hash is not constant, which would make
    // every unmatched trip identical.
    const keys = new Set(
      Array.from({ length: 40 }, (_, i) =>
        imageKeyForTrip(trip({ id: `trip-${i}`, tripType: "unknown", destinations: [] })),
      ),
    );
    expect(keys.size).toBeGreaterThan(1);
  });
});
