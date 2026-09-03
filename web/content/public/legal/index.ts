import type { LegalDoc, LegalSlug } from "../types";
import { ACCESSIBILITY } from "./accessibility";
import { COOKIES } from "./cookies";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

/**
 * Screen Inventory 2.0.7 — the four footer pages. The design's fifth "Data processing
 * addendum" is a business-to-business document and is not part of the inventory.
 */
export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  privacy: PRIVACY,
  terms: TERMS,
  cookies: COOKIES,
  accessibility: ACCESSIBILITY,
};

export const LEGAL_SLUGS: readonly LegalSlug[] = ["privacy", "terms", "cookies", "accessibility"];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export function draftLegalDocs(): LegalDoc[] {
  return LEGAL_SLUGS.map((s) => LEGAL_DOCS[s]).filter((d) => d.status !== "reviewed");
}
