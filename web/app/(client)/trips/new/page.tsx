// Screen 2.3.8 Quote Request Form — see docs/Screen-Inventory.md §2.3.8 (Pattern G, §4.4).
// The destination a "Request a quote" CTA resolves to once the visitor is signed in. P2.
import type { Metadata } from "next";
import Link from "next/link";
import { findTrip } from "@/content/public/trips";
import { formatRange } from "@/lib/public/dates";
import { formatMoney } from "@/lib/public/money";
import { SEARCH_TIME_ZONE } from "@/lib/public/search";
import { single, type SearchParams } from "@/lib/search-params";
import { QUOTE } from "./content";
import { QuoteForm } from "./QuoteForm";
import type { QuoteRequestTarget } from "./actions";

export const metadata: Metadata = {
  title: QUOTE.meta.title,
  description: QUOTE.meta.description,
  robots: { index: false, follow: false },
};

/**
 * EVERYTHING IN THE URL IS UNTRUSTED, and here that matters more than usual: this context
 * survived a round trip through the sign-up gate, so it is data the visitor's browser held
 * and could have edited. It is read defensively and — importantly — it is read for DISPLAY
 * only. The values are re-validated by `quote-request` before anything is written, and the
 * indicative rate is stored in a payload field named for what it is rather than in any money
 * column. See that function's header.
 *
 * A curated trip is resolved from the catalog by slug, so its name and place come from our
 * own content rather than the query. A hotel has no catalog row — hotels are deliberately
 * never stored — so its fields do travel, capped and escaped by React on the way out.
 */
export default async function NewTripPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const target = readTarget(params);

  if (!target) {
    return (
      <div className="client-fill mx-auto w-full max-w-160 px-4.5 py-6">
        <h1 className="t-headline-r text-on-surface">{QUOTE.errors.nothing}</h1>
        <Link href="/explore" className="btn btn-filled mt-4">
          {QUOTE.cancel}
        </Link>
      </div>
    );
  }

  const dates = target.checkIn && target.checkOut
    ? formatRange(target.checkIn, target.checkOut, SEARCH_TIME_ZONE)
    : null;

  const rate = target.rateCents
    ? formatMoney({ amountCents: target.rateCents, currency: "USD" }, { whole: true })
    : null;

  const descriptors = [
    target.hotelClass ? QUOTE.summary.starClass(target.hotelClass) : null,
    target.propertyType,
    target.place,
  ].filter(Boolean);

  return (
    <div className="client-fill mx-auto w-full max-w-160 px-4.5 py-6 md:py-8">
      <header className="mb-5">
        <p className="t-label-s text-brand-orange">{QUOTE.overline}</p>
        <h1 className="t-headline-r mt-1 mb-1.5 text-on-surface">{QUOTE.title}</h1>
        <p className="t-body text-on-surface-variant">{QUOTE.body}</p>
      </header>

      <section aria-label={QUOTE.summary.label} className="card mb-5 p-4.5">
        <h2 className="t-title-l text-on-surface">{target.name}</h2>
        {descriptors.length > 0 && (
          <p className="t-body-s mt-0.5 text-on-surface-variant">{descriptors.join(" · ")}</p>
        )}

        <dl className="mt-3.5 grid grid-cols-2 gap-3.5">
          <div>
            <dt className="t-label text-on-surface-variant">{QUOTE.summary.dates}</dt>
            <dd className="t-title-s mt-0.5 text-on-surface">{dates ?? QUOTE.summary.flexibleDates}</dd>
          </div>
          <div>
            <dt className="t-label text-on-surface-variant">{QUOTE.summary.travelers}</dt>
            <dd className="t-title-s mt-0.5 text-on-surface">
              {QUOTE.summary.travelerCount(target.travelers ?? 2)}
            </dd>
          </div>
        </dl>

        {rate && (
          <div className="mt-3.5 border-t border-outline-variant pt-3">
            <p className="t-label text-on-surface-variant">{QUOTE.summary.indicative}</p>
            <p className="t-title-s mt-0.5 text-on-surface">
              {rate}
              <span className="t-fine text-on-surface-variant"> {QUOTE.summary.perNight}</span>
            </p>
            {/* The one line that keeps a public rate from reading as a quote. */}
            <p className="t-body-s mt-1 text-on-surface-variant">{QUOTE.summary.indicativeNote}</p>
          </div>
        )}
      </section>

      <QuoteForm target={target} />
    </div>
  );
}

const KINDS = ["hotel", "cruise", "excursion", "custom"] as const;
const TRIP_TYPES = ["cruise", "all_inclusive", "multi_destination", "group", "custom"] as const;
const SOURCES = ["curated", "serpapi_google_hotels", "track_cruises"] as const;

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function readTarget(params: SearchParams): QuoteRequestTarget | null {
  const kind = pick(single(params.kind), KINDS) ?? "custom";
  const tripType = pick(single(params.tripType), TRIP_TYPES);
  const source = pick(single(params.source), SOURCES);

  // A curated trip is resolved from our own catalog, so nothing a visitor typed reaches the
  // page — the same rule the sign-up gate follows for its headline.
  const slug = single(params.trip);
  const catalog = slug ? findTrip(slug) : undefined;
  if (catalog) {
    return {
      kind,
      tripType,
      source: source ?? "curated",
      name: catalog.name,
      place: catalog.destination.place,
      checkIn: isoDate(single(params.in)),
      checkOut: isoDate(single(params.out)),
      travelers: count(single(params.adults), 1, 20),
      ref: catalog.slug,
    };
  }

  const name = text(single(params.name), 160);
  if (!name) return null;

  return {
    kind,
    tripType,
    source,
    name,
    place: text(single(params.place), 120) ?? undefined,
    checkIn: isoDate(single(params.in)),
    checkOut: isoDate(single(params.out)),
    travelers: count(single(params.adults), 1, 20),
    ref: text(single(params.ref), 220) ?? undefined,
    rateCents: count(single(params.rate), 1, 100_000_00) ?? undefined,
    hotelClass: count(single(params.class), 1, 5) ?? undefined,
    rating: ratingOf(single(params.rating)),
    propertyType: text(single(params.type), 60) ?? undefined,
  };
}

function text(value: string | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

function isoDate(value: string | undefined): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? value : undefined;
}

function count(value: string | undefined, min: number, max: number): number | undefined {
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function ratingOf(value: string | undefined): number | undefined {
  const n = value ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 5) return undefined;
  return Math.round(n * 10) / 10;
}
