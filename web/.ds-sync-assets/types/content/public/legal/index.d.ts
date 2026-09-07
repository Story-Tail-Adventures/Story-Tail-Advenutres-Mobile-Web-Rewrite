import type { LegalDoc, LegalSlug } from "../types";
/**
 * Screen Inventory 2.0.7 — the four footer pages. The design's fifth "Data processing
 * addendum" is a business-to-business document and is not part of the inventory.
 */
export declare const LEGAL_DOCS: Record<LegalSlug, LegalDoc>;
export declare const LEGAL_SLUGS: readonly LegalSlug[];
export declare function isLegalSlug(value: string): value is LegalSlug;
export declare function draftLegalDocs(): LegalDoc[];
