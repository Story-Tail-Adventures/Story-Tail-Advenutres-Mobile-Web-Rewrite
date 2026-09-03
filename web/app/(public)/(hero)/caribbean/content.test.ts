import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/ui/icon-paths";
import { claim } from "@/content/public/proof";
import { isImageKey } from "@/lib/images";
import {
  CARIBBEAN_CLOSING,
  CARIBBEAN_HERO,
  CARIBBEAN_HERO_IMAGE,
  CARIBBEAN_INQUIRY_FIELDS,
  CARIBBEAN_INTRO,
  CARIBBEAN_ISLANDS,
  CARIBBEAN_META,
  CARIBBEAN_STICKY,
  CARIBBEAN_TRIPS,
  caribbeanSeeAllLabel,
  caribbeanTripsOverline,
} from "./content";

describe("2.0.8 Caribbean copy module", () => {
  it("derives the hand-picked overline and See-all label from a count", () => {
    expect(caribbeanTripsOverline(9)).toBe("HAND-PICKED · 9 TRIPS");
    expect(caribbeanTripsOverline(1)).toBe("HAND-PICKED · 1 TRIP");
    expect(caribbeanSeeAllLabel(9)).toBe("See all 9 Caribbean trips →");
    expect(caribbeanSeeAllLabel(1)).toBe("See all 1 Caribbean trip →");
  });

  it("takes its business claims from the registry", () => {
    expect(CARIBBEAN_HERO.sub.startsWith(claim("islandsPlannedAll"))).toBe(true);
    expect(CARIBBEAN_TRIPS.sub.startsWith(claim("catalogUpdatedMonthly"))).toBe(true);
    expect(CARIBBEAN_META.description).toBe(CARIBBEAN_HERO.sub);
  });

  it("references only registered icons and images", () => {
    expect(isImageKey(CARIBBEAN_HERO_IMAGE)).toBe(true);
    expect(isImageKey(CARIBBEAN_CLOSING.image)).toBe(true);
    for (const point of CARIBBEAN_INTRO) expect(ICON_NAMES).toContain(point.icon);
    for (const field of CARIBBEAN_INQUIRY_FIELDS) expect(ICON_NAMES).toContain(field.icon);
  });

  it("has the four prototype inquiry cells and three intro points", () => {
    expect(CARIBBEAN_INQUIRY_FIELDS.map((f) => f.label)).toEqual(["Destination", "When", "Travelers", "Vibe"]);
    expect(CARIBBEAN_INTRO).toHaveLength(3);
  });

  it("never hard-codes a dollar figure", () => {
    const text = [
      CARIBBEAN_HERO.sub,
      CARIBBEAN_ISLANDS.sub,
      CARIBBEAN_TRIPS.title,
      CARIBBEAN_TRIPS.sub,
      CARIBBEAN_CLOSING.title,
      CARIBBEAN_CLOSING.body,
      CARIBBEAN_STICKY.primary,
      CARIBBEAN_STICKY.secondary,
      ...CARIBBEAN_INTRO.flatMap((p) => [p.title, p.body]),
    ].join(" ");
    expect(text).not.toMatch(/\$\d/);
  });
});
