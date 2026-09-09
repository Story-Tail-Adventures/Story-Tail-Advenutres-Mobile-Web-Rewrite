import { describe, expect, it } from "vitest";
import {
  ADVISOR,
  CLAIM_IDS,
  CLAIMS,
  TESTIMONIALS,
  assertProductionReady,
  hasPlaceholders,
  placeholderReport,
  unverifiedClaims,
} from "./proof";

/**
 * The pinned list below is the point of this file: adding a placeholder claim, or verifying
 * one, must show up as a diff here as well as in proof.ts.
 */
const EXPECTED_UNVERIFIED = [
  "travelersServed",
  "ratingValue",
  "reviewCount",
  "avgReplyTime",
  "yearsSpecialist",
  "credInteletravel",
  "credClia",
  "credSandals",
  "credRoyal",
  "bioParent",
  "bioIslands",
  "bioStarted",
  "bioNamed",
  "plannedRoyalBahamian",
  "catalogUpdatedMonthly",
  "sailsEachLineYearly",
  "replyWithin48h",
  "islandsPlannedAll",
  "tripDetails",
  // Live hotel rates. Unverified on purpose: a strict production build must refuse to ship
  // a public price claim until a human has approved the wording (Free-Travel-APIs §9.2).
  "hotelRateBasis",
];

describe("claims registry", () => {
  it("pins exactly which claims are still unverified", () => {
    expect(unverifiedClaims()).toEqual(EXPECTED_UNVERIFIED);
    expect(CLAIM_IDS.length).toBe(Object.keys(CLAIMS).length);
  });

  it("requires a source and date once a claim is marked verified", () => {
    for (const id of CLAIM_IDS) {
      const c = CLAIMS[id];
      if (c.verified) {
        expect(c.source, `${id} needs a source`).toBeTruthy();
        expect(c.verifiedOn, `${id} needs a verifiedOn date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("reports every placeholder class", () => {
    const report = placeholderReport();
    expect(hasPlaceholders(report)).toBe(true);
    expect(report.testimonials).toBe(TESTIMONIALS.length);
    expect(report.unlicensedImages.length).toBeGreaterThan(0);
    expect(report.draftLegal).toEqual(["privacy", "terms", "cookies", "accessibility"]);
    expect(report.placeholderPrices.length).toBeGreaterThan(0);
  });

  it("only blocks in strict mode, and passes a clean report", () => {
    expect(() => assertProductionReady(undefined)).not.toThrow();
    expect(() => assertProductionReady("strict")).toThrow(/placeholder content/);
    expect(() =>
      assertProductionReady("strict", {
        claims: [],
        reviews: [],
        testimonials: 0,
        unlicensedImages: [],
        draftLegal: [],
        placeholderPrices: [],
      }),
    ).not.toThrow();
  });
});

describe("advisor copy", () => {
  it("uses he/him for Gyasi throughout (matches supabase/seed.sql)", () => {
    expect(ADVISOR.pronouns).toBe("he/him");
    expect(ADVISOR.heroLine).not.toMatch(/\bmom\b/i);
    for (const t of TESTIMONIALS) {
      expect(t.quote).not.toMatch(/\b(she|her|hers)\b/i);
      expect(t.consented).toBe(false);
      expect(t.initials).toMatch(/^[A-Z]{2}$/);
    }
  });
});
