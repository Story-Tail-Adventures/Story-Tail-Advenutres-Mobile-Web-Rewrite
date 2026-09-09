/**
 * Content types for the public (pre-auth) surface — Screen Inventory §2.0.
 *
 * The curated catalog behind 2.0.3–2.0.5 and the topic pages (2.0.8–2.0.10) is editorial
 * content Gyasi maintains, not search results: in Phase 2 the travel-API search
 * (Amadeus / Hotelbeds / Viator / Widgety, BRD §9) replaces `TRIPS` as the data source
 * behind /explore/results without changing the pages.
 *
 * Money follows CLAUDE.md rule 5: integer cents plus a three-letter currency code.
 */
import type { IconName } from "@/components/ui/Icon";
import type { ImageKey } from "@/lib/images";

/** Topic landing pages (2.0.8–2.0.10). */
export type Topic = "caribbean" | "cruises" | "honeymoons";

/** Filter rail "Trip type" (2.0.4). */
export type TripType = "all-inclusive" | "cruise" | "hotel" | "tour";

/** Filter rail "Vibe" (2.0.4). */
export type Vibe =
  | "adults-only"
  | "family"
  | "honeymoon"
  | "five-star"
  | "couples"
  | "group"
  | "boutique"
  | "adventure";

/** Filter rail "Budget" (2.0.4), per person. */
export type BudgetBand = "under-2k" | "2k-4k" | "4k-plus";

/** Gyasi's rough $ / $$ / $$$ range chip on tiles — categorical, not a price. */
export type PriceBand = "$" | "$$" | "$$$";

export type Currency = "USD";

export interface Money {
  /** Integer cents. */
  amountCents: number;
  currency: Currency;
}

export type IslandSlug =
  | "turks-and-caicos"
  | "bahamas"
  | "st-lucia"
  | "jamaica"
  | "aruba"
  | "bvi";

export interface Island {
  slug: IslandSlug;
  name: string;
  imageKey: ImageKey;
}

export interface CruiseLine {
  slug: string;
  name: string;
}

export type TripBadge = "Gyasi's pick" | "Great for groups" | "Off-the-beaten";

export interface TripHighlight {
  icon: IconName;
  text: string;
}

/**
 * How a trip appears on one topic page. The prototype gives the same resort different
 * taglines/overlines on Caribbean vs Honeymoons, so placements can override the defaults.
 */
export interface TopicPlacement {
  /** 1-based position in that page's tile grid. */
  order: number;
  overline?: string;
  tagline?: string;
  badge?: TripBadge;
}

export interface Trip {
  /** URL segment for /explore/[slug]. Lowercase, hyphenated, unique. */
  slug: string;
  name: string;
  /** One-line subtitle shown under the name ("Providenciales · Family all-inclusive"). */
  tagline: string;
  /** Uppercase overline on tiles ("ALL-INCLUSIVE · FAMILY"). */
  overline: string;
  type: TripType;
  vibes: Vibe[];
  /** Which topic pages feature this trip, and how. */
  topics: Partial<Record<Topic, TopicPlacement>>;
  destination: {
    /** Human place name ("Nassau, Bahamas"). */
    place: string;
    /** Broad region for search matching ("Caribbean", "Bahamas", "Mexico"). */
    region: string;
    island?: IslandSlug;
  };
  nights?: number;
  band: PriceBand;
  /** Illustrative "from" price per person. */
  from: Money;
  /** When the illustrative price was last checked (ISO date). */
  priceAsOf: string;
  /**
   * True until a supplier quote backs the number. The prototype prices only four trips
   * ("design"); everything else carries a band-consistent figure ("illustrative").
   */
  pricePlaceholder: boolean;
  priceSource: "design" | "illustrative";
  priceNote: string;
  badge?: TripBadge;
  imageKey: ImageKey;
  heroImageKey?: ImageKey;
  /** Detail page (2.0.5) copy. */
  description: string;
  highlights: TripHighlight[];
  sampleItinerary: string[];
  /** Cruise line name for sailings. */
  line?: string;
}

export interface InspirationTile {
  slug: string;
  title: string;
  imageKey: ImageKey;
  /** Search parameters this tile pre-fills on /explore/results. */
  query: {
    topic?: Topic;
    type?: TripType;
    vibe?: Vibe;
    dest?: string;
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

export type LegalSlug = "privacy" | "terms" | "cookies" | "accessibility";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  /** Short label for the sidebar / chip strip. */
  navLabel: string;
  description: string;
  /** ISO date of the last edit to the text. */
  lastUpdated: string;
  status: "draft" | "reviewed";
  reviewedBy?: string;
  sections: LegalSection[];
}

/** A marketing claim about Gyasi's business that must be verified before production. */
export interface Claim {
  display: string;
  /** Secondary line, e.g. a credential's detail. */
  detail?: string;
  verified: boolean;
  /** Where the figure came from once verified (e.g. "Inteletravel dashboard, 2026-08"). */
  source?: string;
  verifiedOn?: string;
}

export interface Testimonial {
  quote: string;
  who: string;
  /** "Symphony · Dec 2024" */
  trip: string;
  /** Initials rendered in the avatar circle. */
  initials: string;
  /** Written consent to publish this quote under this name. */
  consented: boolean;
}
