import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { formatTripDates } from "@/lib/trips/format";
import { loadItinerary } from "@/lib/trips/queries";
import { ITINERARY } from "./content";
import {
  ActivityCard,
  EmptyComponentCard,
  EmptyComponentStates,
  ImportantInfo,
} from "./ItineraryParts";

export const metadata: Metadata = { title: "Itinerary" };

/**
 * Screen 2.2.4 Itinerary Viewer — see docs/Screen-Inventory.md §2.2.4 and §4.4 (Pattern I:
 * "reading width capped (~720pt) for legibility", a sticky day navigator on the left at web
 * and a horizontal chip strip on mobile) and
 * design/source-prototype/screens/client-trip.jsx (C224_ItineraryViewer) +
 * client-trip-mobile.jsx (M224_ItineraryViewer). P1.
 *
 * Also Screen 2.2.8 Empty Trip Component States, which §4.4 places "inline within Itinerary
 * Viewer" — they are rendered by [EmptyComponentStates] here rather than on a route.
 *
 * EVERY DAY IS RENDERED, not one at a time behind a client-side selector. Pattern I is a
 * READING layout: §4.2's "content parity, not feature parity" and the reading-width cap both
 * point at a document you scroll, and a seven-day trip is a few dozen rows. The day chips
 * are anchor links into it, so they work with no JavaScript, survive a share, and leave
 * 2.2.5 as the place you go for one day in detail rather than a different view of the same
 * thing.
 *
 * "Share with co-traveler" collapses into the PDF. The secure link is deferred to §2.8.
 */
export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const itinerary = await loadItinerary(tripId);

  if (!itinerary) {
    // An unpublished itinerary is invisible to this session, so "not published" and "no
    // itinerary" arrive identically — and the honest thing is the gentler of the two, since
    // a trip you can open almost always has a draft behind it.
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <EmptyState
          icon="clock"
          title={ITINERARY.notPublishedTitle}
          body={ITINERARY.notPublishedBody}
          action={{ label: ITINERARY.back, href: `/trips/${tripId}` }}
        />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <header className="border-b border-outline-variant bg-surface px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Link href={`/trips/${tripId}`} className="t-body-s inline-flex items-center gap-1 text-on-surface-variant">
            <Icon name="arrow_left" size={14} /> {ITINERARY.back}
          </Link>
          <div className="mt-1.5">
            <span className={`chip-status ${itinerary.tripChip}`}>{itinerary.tripStatusLabel}</span>
          </div>
          <h1 className="t-headline mt-1.5">{itinerary.tripTitle}</h1>
          <p className="t-body-s text-on-surface-variant">
            {[
              formatTripDates(itinerary.startDate, itinerary.endDate),
              `${itinerary.travelerCount} travelers`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {itinerary.days.length > 1 && (
        <nav
          className="sticky top-16 z-20 border-b border-outline-variant bg-bg/95 backdrop-blur"
          aria-label="Days"
        >
          <div className="mx-auto flex w-full max-w-3xl gap-1.5 overflow-x-auto px-4 py-2.5 md:px-6">
            {itinerary.days.map((day) => (
              <a
                key={day.id}
                href={`#day-${day.dayNumber}`}
                className="chip tap-44 h-8 shrink-0 bg-surface-2"
              >
                {ITINERARY.dayShort(day.dayNumber)}
              </a>
            ))}
          </div>
        </nav>
      )}

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        {/* Design-System §2.4: "the intro note Gyasi writes per trip is the place to let the
            voice come through". It leads, in the script face, because it is the one piece of
            this screen that is not logistics. */}
        {itinerary.introNote && (
          <p className="t-body-l max-w-prose text-on-surface-variant">{itinerary.introNote}</p>
        )}

        {itinerary.days.length === 0 ? (
          <div className="mt-5">
            <EmptyComponentCard
              icon="calendar"
              title={ITINERARY.emptyItineraryTitle}
              body={ITINERARY.emptyItineraryBody}
              big
              tripId={tripId}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            {itinerary.days.map((day) => (
              <section key={day.id} id={`day-${day.dayNumber}`} className="scroll-mt-32">
                <div className="flex items-baseline gap-3">
                  <span className="t-script text-[32px] text-brand-burgundy">
                    {ITINERARY.dayLabel(day.dayNumber)}
                  </span>
                  <span className="t-title-s">{day.label ?? formatTripDates(day.date, null)}</span>
                  <Link
                    href={`/trips/${tripId}/itinerary/${day.dayNumber}`}
                    className="btn btn-text btn-sm ml-auto shrink-0"
                  >
                    Open <Icon name="chevron_right" size={13} />
                  </Link>
                </div>

                {day.summary && (
                  <p className="t-body-l mt-1 max-w-prose text-on-surface-variant">{day.summary}</p>
                )}

                <div className="mt-3 flex flex-col gap-2.5">
                  {day.activities.length === 0 ? (
                    <EmptyComponentCard
                      icon="sparkle"
                      title={ITINERARY.emptyDayTitle(day.dayNumber)}
                      body={ITINERARY.emptyDayBody}
                    />
                  ) : (
                    day.activities.map((activity) => (
                      <ActivityCard key={activity.id} activity={activity} />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        <EmptyComponentStates itinerary={itinerary} />

        {itinerary.closingNote && (
          <p className="t-script mt-8 text-[24px] leading-tight text-brand-burgundy">
            {itinerary.closingNote}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {/* The PDF export is not built — it needs a renderer and a signed download, both
              §2.2.4 work that did not fit this stage. Disabled and saying so beats a button
              that produces nothing. */}
          <button
            type="button"
            className="btn btn-tonal w-full"
            disabled
            aria-disabled="true"
            title="PDF export arrives with the next release"
          >
            <Icon name="download" size={14} /> {ITINERARY.downloadPdf}
          </button>
          <p className="t-body-s text-center text-on-surface-variant">{ITINERARY.shareNote}</p>
          <ImportantInfo itinerary={itinerary} />
        </div>
      </div>
    </div>
  );
}
