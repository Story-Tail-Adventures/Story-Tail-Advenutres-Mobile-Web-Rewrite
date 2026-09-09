import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { Topic, Trip } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { joinHref, tripHref } from "@/lib/public/links";
import { Photo } from "./Photo";
import { PriceRange } from "./PriceRange";

interface TripTileProps {
  trip: Trip;
  /** Apply this topic page's placement overrides (tagline, overline, badge). */
  topic?: Topic;
  /** `card` from `md` and `row` below it, unless forced. */
  layout?: "card" | "row" | "responsive";
  /** Path to return to after sign-up (the page this tile is on). */
  next: string;
  className?: string;
}

/**
 * Curated trip tile (design: TripTile = card, MTripTile = mobile row). The title links to the
 * detail page; "Request quote" and the heart go to the sign-up gate with context.
 */
export function TripTile({ trip, topic, layout = "responsive", next, className }: TripTileProps) {
  const placement = topic ? trip.topics[topic] : undefined;
  const overline = placement?.overline ?? trip.overline;
  const tagline = placement?.tagline ?? trip.tagline;
  const badge = placement?.badge ?? trip.badge;
  const detail = tripHref(trip.slug);
  const quote = joinHref({ intent: "quote", trip: trip.slug, next });
  const save = joinHref({ intent: "save", trip: trip.slug, next });

  const card = (
    <article
      className={cn(
        "card flex-col",
        layout === "responsive" ? "hidden md:flex" : "flex",
        className,
      )}
    >
      <div className="relative aspect-5/3">
        <Photo image={trip.imageKey} fill sizes="(min-width: 1200px) 400px, 50vw" alt="" className="object-cover" />
        {badge && (
          <span className="t-badge absolute top-2.5 left-2.5 rounded-full bg-secondary px-2.25 py-0.75 text-on-secondary">
            {badge}
          </span>
        )}
        <PriceRange band={trip.band} className="absolute top-2.5 right-2.5" />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="t-label-s text-brand-orange">{overline}</p>
        <h3 className="t-title-s mt-0.5 text-on-surface">
          <Link href={detail} className="hover:underline">
            {trip.name}
          </Link>
        </h3>
        <p className="t-body-s text-on-surface-variant">{tagline}</p>
        <div className="mt-auto flex gap-1.5 pt-2.5">
          <Link href={quote} className="btn btn-filled btn-sm flex-1">
            Request quote
          </Link>
          <Link
            href={save}
            className="btn-icon size-8 rounded-lg border border-outline-variant"
            aria-label={`Save ${trip.name} for later`}
          >
            <Icon name="heart" size={14} />
          </Link>
        </div>
      </div>
    </article>
  );

  const row = (
    <article
      className={cn(
        "card overflow-hidden",
        layout === "responsive" ? "flex md:hidden" : "flex",
        className,
      )}
    >
      <div className="relative w-30 shrink-0">
        <Photo image={trip.imageKey} fill sizes="120px" alt="" className="object-cover" />
        {badge && (
          <span className="t-badge-s absolute top-1.5 left-1.5 rounded bg-secondary px-1.5 py-0.5 text-on-secondary">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-1.5">
          <p className="t-label-s text-brand-orange">{overline}</p>
          <PriceRange band={trip.band} size="sm" />
        </div>
        <h3 className="t-row-title mt-0.5 text-on-surface">
          <Link href={detail}>{trip.name}</Link>
        </h3>
        <p className="t-label-l text-on-surface-variant">{tagline}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          {/* `tap-44`, not `min-h-11`: MTripTile draws a 32px btn-sm, so grow only the hit
              area (the utility is gated to `pointer: coarse`). */}
          <Link href={quote} className="btn btn-filled btn-sm tap-44">
            Request quote
          </Link>
          <Link
            href={save}
            className="btn-icon tap-44 size-8 rounded-lg border border-outline-variant"
            aria-label={`Save ${trip.name} for later`}
          >
            <Icon name="heart" size={14} />
          </Link>
        </div>
      </div>
    </article>
  );

  if (layout === "card") return card;
  if (layout === "row") return row;
  return (
    <>
      {card}
      {row}
    </>
  );
}
