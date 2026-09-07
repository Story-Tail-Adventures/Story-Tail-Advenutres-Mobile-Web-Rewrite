import type { Claim, Testimonial } from "./types";
/**
 * MARKETING CLAIMS REGISTRY — every statement about Gyasi's business that a visitor could
 * take as fact lives here, once, with a `verified` flag.
 *
 * Nothing in this file is verified yet. The values are the design prototype's placeholder
 * copy, kept verbatim (user decision) so the pages match the artboards while the real
 * figures are gathered. Two things make it impossible to ship them by accident:
 *
 *  1. `<PlaceholderBanner/>` renders on every public page while `unverifiedClaims()` is
 *     non-empty (or a photo is unlicensed, a legal page is a draft, or a price is a
 *     placeholder).
 *  2. With PUBLIC_CLAIMS_MODE=strict in the environment — set ONLY in the production
 *     deployment — this module throws at import, so `next build` fails.
 *
 * To verify a claim: change the value if needed, set `verified: true`, and record the
 * `source` and `verifiedOn`. The pinned list in proof.test.ts must be updated in the same
 * change, so a new placeholder is always a visible diff.
 *
 * Pronouns: Gyasi Story is he/him (supabase/seed.sql). The prototype copy said "mom of
 * three" and "she"; it is corrected here and the parent line stays unverified.
 */
export declare const CLAIM_IDS: readonly ["travelersServed", "ratingValue", "reviewCount", "avgReplyTime", "yearsSpecialist", "credInteletravel", "credClia", "credSandals", "credRoyal", "bioParent", "bioIslands", "bioStarted", "bioNamed", "plannedRoyalBahamian", "catalogUpdatedMonthly", "sailsEachLineYearly", "replyWithin48h", "islandsPlannedAll", "tripDetails"];
export type ClaimId = (typeof CLAIM_IDS)[number];
export declare const CLAIMS: Record<ClaimId, Claim>;
export declare function claim(id: ClaimId): string;
/** "Hosted by Inteletravel · CLIA member · 4.9★ from 138 travelers" (2.0.3 trust row). */
export declare function trustLine(): string;
/** Third-party ratings the prototype shows on result cards and the detail hero. */
export declare const TRIP_REVIEWS: Record<string, Claim & {
    rating: number;
    count: number;
}>;
export declare function tripRating(slug: string): number | undefined;
export declare const ADVISOR: {
    readonly name: "Gyasi Story";
    readonly firstName: "Gyasi";
    readonly pronouns: "he/him";
    readonly initials: "GS";
    readonly title: "Travel Advisor";
    /** 2.0.11 hero line — the parent claim is unverified; the rest is from the prototype. */
    readonly heroLine: `Caribbean specialist, ${string}, Sandals-certified, hosted by Inteletravel. I plan the kind of week that turns into a story your family tells for years \u2014 and I don't disappear after the deposit clears.`;
    readonly shortBio: "Caribbean specialist hosted by Inteletravel. Family travel, honeymoons, cruises, and the kind of all-inclusive weeks that turn into stories worth retelling.";
};
/**
 * Testimonials — prototype placeholders. Publishing an endorsement without the person's
 * consent is unlawful for a US business (16 CFR Part 465), so every entry is
 * `consented: false` until a real, permissioned quote replaces it. Pronouns corrected to
 * he/him.
 */
export declare const TESTIMONIALS: readonly Testimonial[];
export interface PlaceholderReport {
    claims: ClaimId[];
    reviews: string[];
    testimonials: number;
    unlicensedImages: string[];
    draftLegal: string[];
    placeholderPrices: string[];
}
export declare function placeholderReport(): PlaceholderReport;
export declare function unverifiedClaims(): ClaimId[];
export declare function hasPlaceholders(report?: PlaceholderReport): boolean;
export declare const PLACEHOLDER_BANNER = "Preview content \u2014 some figures, quotes, prices and photos are placeholders pending verification.";
/**
 * Production gate. Runs at import so a strict build cannot render a page that depends on
 * this module while anything above is still a placeholder.
 */
export declare function assertProductionReady(mode?: string | undefined, report?: PlaceholderReport): void;
