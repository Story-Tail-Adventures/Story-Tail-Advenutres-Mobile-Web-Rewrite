import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/components/ui/icon-paths";
import { claim } from "@/content/public/proof";
import { isImageKey } from "@/lib/images";
import {
  HONEYMOONS_CHRISTIAN_CARD,
  HONEYMOONS_CLOSING,
  HONEYMOONS_FEATURED,
  HONEYMOONS_HERO,
  HONEYMOONS_HERO_IMAGE,
  HONEYMOONS_INQUIRY_FIELDS,
  HONEYMOONS_META,
  HONEYMOONS_NOTE,
  HONEYMOONS_STICKY,
  HONEYMOONS_STYLES,
  HONEYMOONS_STYLES_SECTION,
  honeymoonsFeaturedOverline,
} from "./content";

describe("2.0.10 Honeymoons copy module", () => {
  it("derives the featured overline from a count", () => {
    expect(honeymoonsFeaturedOverline(6)).toBe("FEATURED · 6 PACKAGES");
    expect(honeymoonsFeaturedOverline(1)).toBe("FEATURED · 1 PACKAGE");
  });

  it("takes the reply promise from the claims registry", () => {
    expect(HONEYMOONS_CLOSING.body.endsWith(`${claim("replyWithin48h")}.`)).toBe(true);
    expect(HONEYMOONS_META.description).toBe(HONEYMOONS_HERO.sub);
  });

  it("splits Gyasi's note around the italic question so the page can mark it up", () => {
    expect(HONEYMOONS_NOTE.before.endsWith(": ")).toBe(true);
    expect(HONEYMOONS_NOTE.question).toBe("what kind of rest does your marriage need to begin with?");
    expect(HONEYMOONS_NOTE.after.startsWith(" ")).toBe(true);
  });

  it("references only registered icons and images", () => {
    expect(isImageKey(HONEYMOONS_HERO_IMAGE)).toBe(true);
    expect(isImageKey(HONEYMOONS_CLOSING.image)).toBe(true);
    expect(isImageKey(HONEYMOONS_CHRISTIAN_CARD.image)).toBe(true);
    for (const style of HONEYMOONS_STYLES) expect(isImageKey(style.image)).toBe(true);
    for (const field of HONEYMOONS_INQUIRY_FIELDS) expect(ICON_NAMES).toContain(field.icon);
  });

  it("has the four prototype inquiry cells and three styles with distinct tags", () => {
    expect(HONEYMOONS_INQUIRY_FIELDS.map((f) => f.label)).toEqual(["Destination", "When", "Travelers", "Vibe"]);
    expect(HONEYMOONS_STYLES.map((s) => s.tag)).toEqual(["ALL-INCLUSIVE", "OVERWATER", "MULTI-STOP"]);
  });

  it("never hard-codes a dollar figure", () => {
    const text = [
      HONEYMOONS_HERO.sub,
      HONEYMOONS_NOTE.before,
      HONEYMOONS_NOTE.question,
      HONEYMOONS_NOTE.after,
      HONEYMOONS_STYLES_SECTION.title,
      HONEYMOONS_FEATURED.title,
      HONEYMOONS_CHRISTIAN_CARD.title,
      HONEYMOONS_CHRISTIAN_CARD.body,
      HONEYMOONS_CLOSING.title,
      HONEYMOONS_CLOSING.body,
      HONEYMOONS_STICKY.primary,
      HONEYMOONS_STICKY.secondary,
      ...HONEYMOONS_STYLES.flatMap((s) => [s.title, s.body]),
    ].join(" ");
    expect(text).not.toMatch(/\$\d/);
  });
});
