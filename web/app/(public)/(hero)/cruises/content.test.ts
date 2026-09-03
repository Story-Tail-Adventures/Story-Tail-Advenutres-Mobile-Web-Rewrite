import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/ui/icon-paths";
import { CRUISE_LINES } from "@/content/public/cruise-lines";
import { claim } from "@/content/public/proof";
import { isImageKey } from "@/lib/images";
import {
  CRUISES_CLOSING,
  CRUISES_HERO,
  CRUISES_HERO_IMAGE,
  CRUISES_INQUIRY_FIELDS,
  CRUISES_LINES_SECTION,
  CRUISES_META,
  CRUISES_STICKY,
  CRUISES_TRIPS,
  CRUISES_TYPES,
  CRUISES_TYPES_SECTION,
  cruisesSeeAllLabel,
  cruisesTripsOverline,
} from "./content";

describe("2.0.9 Cruises copy module", () => {
  it("derives the hand-picked overline and See-all label from a count", () => {
    expect(cruisesTripsOverline(9)).toBe("HAND-PICKED · 9 SAILINGS");
    expect(cruisesTripsOverline(1)).toBe("HAND-PICKED · 1 SAILING");
    expect(cruisesSeeAllLabel(9)).toBe("See all 9 sailings →");
    expect(cruisesSeeAllLabel(1)).toBe("See all 1 sailing →");
  });

  it("takes the lived-experience line from the claims registry", () => {
    expect(CRUISES_TYPES_SECTION.sub).toBe(claim("sailsEachLineYearly"));
    expect(CRUISES_META.description).toBe(CRUISES_HERO.sub);
  });

  it("keeps the 'Eight lines' headline true to the chip row it introduces", () => {
    expect(CRUISES_LINES_SECTION.title.startsWith("Eight lines")).toBe(true);
    expect(CRUISE_LINES).toHaveLength(8);
  });

  it("references only registered icons and images", () => {
    expect(isImageKey(CRUISES_HERO_IMAGE)).toBe(true);
    expect(isImageKey(CRUISES_CLOSING.image)).toBe(true);
    for (const type of CRUISES_TYPES) expect(isImageKey(type.image)).toBe(true);
    for (const field of CRUISES_INQUIRY_FIELDS) expect(ICON_NAMES).toContain(field.icon);
  });

  it("has the four prototype inquiry cells and three audience cards with distinct tags", () => {
    expect(CRUISES_INQUIRY_FIELDS.map((f) => f.label)).toEqual(["Destination", "When", "Travelers", "Vibe"]);
    expect(CRUISES_TYPES.map((t) => t.tag)).toEqual(["FAMILY", "ADULTS", "GROUP"]);
  });

  it("never hard-codes a dollar figure", () => {
    const text = [
      CRUISES_HERO.sub,
      CRUISES_TYPES_SECTION.sub,
      CRUISES_LINES_SECTION.title,
      CRUISES_TRIPS.title,
      CRUISES_CLOSING.title,
      CRUISES_CLOSING.body,
      CRUISES_STICKY.primary,
      CRUISES_STICKY.secondary,
      ...CRUISES_TYPES.flatMap((t) => [t.title, t.body]),
    ].join(" ");
    expect(text).not.toMatch(/\$\d/);
  });
});
