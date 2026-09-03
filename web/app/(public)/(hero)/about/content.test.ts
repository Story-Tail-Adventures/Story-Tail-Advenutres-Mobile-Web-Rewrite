import { describe, expect, it } from "vitest";
import { ADVISOR, CLAIMS, claim } from "@/content/public/proof";
import { ABOUT, ABOUT_CREDENTIALS, ABOUT_STATS } from "./content";

describe("about copy", () => {
  it("draws every stat from the claims registry", () => {
    expect(ABOUT_STATS.map((s) => s.value)).toEqual([
      claim("travelersServed"),
      `${claim("ratingValue")} ★`,
      claim("avgReplyTime"),
      claim("yearsSpecialist"),
    ]);
    expect(ABOUT_STATS[1].label).toBe(`${claim("reviewCount")} reviews`);
    expect(ABOUT_STATS.map((s) => s.icon)).toEqual(["users", "star", "message", "palm"]);
  });

  it("lists the four credentials in prototype order", () => {
    expect(ABOUT_CREDENTIALS).toEqual([
      CLAIMS.credInteletravel,
      CLAIMS.credClia,
      CLAIMS.credSandals,
      CLAIMS.credRoyal,
    ]);
  });

  it("interpolates the bio years from the registry and italicises the brand", () => {
    const [first] = ABOUT.story.paragraphs;
    const text = first.map((p) => (typeof p === "string" ? p : p.em)).join("");
    expect(text).toContain(`in ${claim("bioStarted")} because`);
    expect(text).toContain(`By ${claim("bioNamed")} the side-thing`);
    expect(first).toContainEqual({ em: "Story-Tail Adventures" });
    expect(ABOUT.story.paragraphs).toHaveLength(3);
  });

  it("uses the registry's he/him hero line and the corrected credentials title", () => {
    expect(ABOUT.hero.lead).toBe(ADVISOR.heroLine);
    expect(ABOUT.hero.lead).not.toMatch(/\bmom\b|\bshe\b/i);
    expect(ABOUT.credentials.title).toBe("Trained, certified, hosted.");
  });
});
