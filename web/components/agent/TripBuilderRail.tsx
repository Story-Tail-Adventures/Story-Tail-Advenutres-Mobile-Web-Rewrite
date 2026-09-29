import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { COMPONENT_RAIL, COMPONENT_SPECS } from "@/lib/agent/components";
import { SaveAsTemplateDialog } from "@/components/agent/SaveAsTemplateDialog";
import { BUILDER_COPY, TEMPLATE_COPY } from "@/lib/agent/content";

/**
 * §3.4.4's left rail: one button per `component_kind`.
 *
 * SEVEN, NOT THE PROTOTYPE'S EIGHT. `A344_TripBuilder` lists a "Dining · manual" entry;
 * there is no `dining` in `component_kind` and Data-Model §23 ruled that a dinner
 * reservation is a `custom` component, which is what "Something else" is for. Same call
 * the sixth trip-type tile got in §3.4.3.
 *
 * AND NO SUPPLIER NAMES. The prototype's labels read "Flight · Amadeus", "Hotel ·
 * Hotelbeds", "Cruise · Widgety", "Tour · Viator". Every one of those is a Phase 2
 * integration that is not wired, so the label promises a search the button does not do.
 * The sheet says what is actually coming, once, instead of four buttons each implying it.
 *
 * EACH IS A `<Link>`, not a button — the sheet is a URL (`?add=flight`), so the back
 * button closes it and the page works with JavaScript off.
 *
 * A ROW BELOW `xl`, A COLUMN AT `xl`. Seven full-width rows stacked above the canvas is
 * most of a laptop screen before the advisor reaches the trip they came to look at. The
 * same seven as a wrapping strip of chips is two lines. The prototype only ever draws the
 * 1440 case, where the column is right.
 */
export function TripBuilderRail({
  tripId,
  tripTitle,
}: {
  tripId: string;
  /** For the template dialog's default name — the commonest case is confirm and go. */
  tripTitle: string;
}) {
  return (
    <aside className="card p-3 xl:self-start">
      <p className="t-label mb-2 text-[var(--md-on-surface-variant)]">
        {BUILDER_COPY.addHeading.toUpperCase()}
      </p>
      <div className="flex flex-wrap gap-1 xl:flex-col">
        {COMPONENT_RAIL.map((kind) => {
          const spec = COMPONENT_SPECS[kind];
          return (
            <Link
              key={kind}
              href={`/agent/trips/${tripId}/builder?add=${kind}`}
              className="flex items-center gap-2 rounded-xl border border-[var(--md-outline-variant)] px-2 py-1.5 hover:bg-[var(--md-surface-2)] xl:border-0"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]">
                <Icon name={spec.icon} size={13} />
              </span>
              <span className="t-body-s xl:flex-1">{spec.shortLabel}</span>
              <span className="text-[var(--md-on-surface-variant)]">
                <Icon name="plus" size={11} />
              </span>
            </Link>
          );
        })}
      </div>

      {/* §3.4.13, live since 2026-09-28. This was disabled with its reason while
          `trip_template` had no rows and no producer.

          THE VERB CHANGED, and deliberately. The prototype's rail draws three named
          templates to APPLY, and applying one belongs where a trip is being created
          (§3.4.3's picker) rather than here — a trip already under construction has
          bookings of its own, and the RPC refuses a second pattern on the same trip. What
          the builder is actually good for is the other direction: an advisor looking at
          the bookings they just assembled, saving them as the pattern. */}
      <div className="mt-3">
        <SaveAsTemplateDialog
          tripId={tripId}
          tripTitle={tripTitle}
          label={BUILDER_COPY.saveAsTemplateLabel}
          className="btn btn-outlined btn-sm w-full"
        />
        <Link
          href="/agent/templates"
          className="t-body-s mt-2 block text-center text-[var(--md-on-surface-variant)] hover:underline"
        >
          {TEMPLATE_COPY.navLabel}
        </Link>
      </div>
    </aside>
  );
}
