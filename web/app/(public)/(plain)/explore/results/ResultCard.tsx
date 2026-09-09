import Link from "next/link";
import { Photo } from "@/components/public/Photo";
import { Icon } from "@/components/ui/Icon";
import type { Trip } from "@/content/public/types";
import { joinHref, quoteKindFor, requestQuoteHref, tripHref } from "@/lib/public/links";
import { formatMoney } from "@/lib/public/money";
import { RESULTS } from "./content";

interface ResultCardProps {
  trip: Trip;
  /** Third-party rating from the claims registry, when one exists. */
  rating?: number;
  /** The current results URL, so the gate can return here. */
  next: string;
}

/**
 * One search result (design C204 row: 180px photo | body | price column; M204 stacked card
 * below `web`). The name links to the detail page; "Request quote" and "Save" go to the
 * sign-up gate with the trip and the return path.
 */
export function ResultCard({ trip, rating, next }: ResultCardProps) {
  const detail = tripHref(trip.slug);
  const quote = requestQuoteHref({
    ...quoteKindFor(trip.type),
    slug: trip.slug,
    name: trip.name,
    source: "curated",
  });
  const save = joinHref({ intent: "save", trip: trip.slug, next });
  const price = formatMoney(trip.from, { whole: true });

  const sub = (
    <>
      {trip.tagline}
      {rating !== undefined && (
        <>
          {" · "}
          <span className="inline-flex items-center gap-1 align-baseline">
            <Icon name="star" size={11} filled className="text-brand-sunset" />
            {rating}
          </span>
        </>
      )}
    </>
  );

  return (
    <>
      {/* Row layout — web (≥1200). */}
      <article className="result-row card hidden p-0 web:grid">
        <div className="relative min-h-30">
          <Photo image={trip.imageKey} fill sizes="180px" alt="" className="object-cover" />
        </div>
        <div className="min-w-0 px-4 py-3.5">
          <span className="t-tag-navy">{trip.overline}</span>
          <h2 className="t-title-l mt-1.5 mb-0.5 text-on-surface">
            <Link href={detail} className="hover:underline">
              {trip.name}
            </Link>
          </h2>
          <p className="t-body-s text-on-surface-variant">{sub}</p>
        </div>
        <div className="flex min-w-42.5 flex-col items-end border-l border-outline-variant px-4 py-3.5 text-right">
          <p className="t-label text-on-surface-variant">{RESULTS.card.from}</p>
          <p className="t-title-l my-0.5 text-on-surface">
            {price}
            <span className="t-fine text-on-surface-variant"> {RESULTS.card.perPerson}</span>
          </p>
          <Link href={quote} className="btn btn-filled btn-sm mt-auto">
            {RESULTS.card.quote}
          </Link>
          <Link href={save} className="btn btn-text btn-sm mt-1 px-0">
            <Icon name="heart" size={11} />
            {RESULTS.card.save}
          </Link>
        </div>
      </article>

      {/* Stacked layout — mobile and tablet. */}
      <article className="card web:hidden">
        <div className="relative aspect-video">
          <Photo image={trip.imageKey} fill sizes="(min-width: 768px) 50vw, 100vw" alt="" className="object-cover" />
          <span className="t-tag-navy absolute top-2 left-2">{trip.overline}</span>
          <Link
            href={save}
            className="btn-icon tap-44 absolute top-2 right-2 size-8 rounded-full bg-white/92 text-brand-navy"
            aria-label={RESULTS.card.saveAria(trip.name)}
          >
            <Icon name="heart" size={14} />
          </Link>
        </div>
        <div className="p-3">
          <h2 className="t-title-s text-on-surface">
            <Link href={detail}>{trip.name}</Link>
          </h2>
          <p className="t-body-s text-on-surface-variant">{sub}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <span className="t-label text-on-surface-variant">{RESULTS.card.from}</span>
              <div className="t-price text-on-surface">
                {price}
                <span className="t-fine text-on-surface-variant"> {RESULTS.card.perPerson}</span>
              </div>
            </div>
            <Link href={quote} className="btn btn-filled btn-sm">
              {RESULTS.card.quote}
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
