import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { formatLongDay } from "@/lib/trips/format";
import { loadItinerary } from "@/lib/trips/queries";
import { ITINERARY } from "../content";
import {
  ActivityCard,
  EmptyComponentCard,
  ImportantInfo,
  WeatherCard,
} from "../ItineraryParts";
import { MarkDoneList } from "./MarkDoneList";

export const metadata: Metadata = { title: "Day" };

/**
 * Screen 2.2.5 Itinerary Day Detail — see docs/Screen-Inventory.md §2.2.5 and §4.4
 * (Pattern I, and "maps are full-screen on mobile, inline on tablet/web") and
 * design/source-prototype/screens/client-trip.jsx (C225_DayDetail) + client-trip-mobile.jsx
 * (M225_DayDetail). P1.
 *
 * The weather card sits ABOVE the activities rather than in a right rail, because it is the
 * reason you would open this screen on the morning of — it is the day's context, not a
 * sidebar afterthought. M225 draws it that way.
 *
 * TWO THINGS THE DESKTOP ARTBOARD SHOWS THAT ARE NOT HERE:
 *   * The "OFFLINE-READY / Synced 2h ago" card. Offline UI is Phase 3 per BRD §13.3 and
 *     Screen-Inventory:714, even though the SqlDelight cache is Phase 1 — a "synced" badge
 *     on the web, which has no cache at all, would be a straight lie.
 *   * A live weather lookup. `itinerary_day.weather_forecast` is agent-authored and cached
 *     with a TTL; BRD §9 names no weather integration and this column is why none is needed.
 *
 * "Mark as done" ships as PER-DEVICE state — see MarkDoneList for why, and for what that
 * costs.
 */
export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ tripId: string; day: string }>;
}) {
  const { tripId, day: dayParam } = await params;
  const dayNumber = Number.parseInt(dayParam, 10);
  if (!Number.isInteger(dayNumber)) notFound();

  const itinerary = await loadItinerary(tripId);
  const day = itinerary?.days.find((d) => d.dayNumber === dayNumber);
  if (!itinerary || !day) notFound();

  const index = itinerary.days.findIndex((d) => d.dayNumber === dayNumber);
  const prev = index > 0 ? itinerary.days[index - 1] : null;
  const next = index < itinerary.days.length - 1 ? itinerary.days[index + 1] : null;

  return (
    <div className="pb-10">
      <header className="border-b border-outline-variant bg-surface px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            href={`/trips/${tripId}/itinerary`}
            className="t-body-s inline-flex items-center gap-1 text-on-surface-variant"
          >
            <Icon name="arrow_left" size={14} /> {ITINERARY.heading}
          </Link>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="t-script text-[36px] text-brand-burgundy">
              {ITINERARY.dayLabel(day.dayNumber)}
            </span>
            <div className="min-w-0">
              <h1 className="t-headline">{day.label ?? formatLongDay(day.date)}</h1>
              <p className="t-body-s text-on-surface-variant">{formatLongDay(day.date)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        {day.weather && (
          <div className="mb-4">
            <WeatherCard weather={day.weather} />
          </div>
        )}

        {day.summary && (
          <p className="t-body-l mb-4 max-w-prose text-on-surface-variant">{day.summary}</p>
        )}

        {day.activities.length === 0 ? (
          <EmptyComponentCard
            icon="sparkle"
            title={ITINERARY.emptyDayTitle(day.dayNumber)}
            body={ITINERARY.emptyDayBody}
          />
        ) : (
          <MarkDoneList tripId={tripId} dayNumber={day.dayNumber}>
            {day.activities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} showDetail />
            ))}
          </MarkDoneList>
        )}

        <nav className="mt-6 flex items-center justify-between gap-3">
          {prev ? (
            <Link href={`/trips/${tripId}/itinerary/${prev.dayNumber}`} className="btn btn-outlined btn-sm">
              <Icon name="arrow_left" size={13} /> {ITINERARY.dayShort(prev.dayNumber)}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/trips/${tripId}/itinerary/${next.dayNumber}`} className="btn btn-outlined btn-sm">
              {ITINERARY.dayShort(next.dayNumber)} <Icon name="arrow_right" size={13} />
            </Link>
          )}
        </nav>

        <div className="mt-6">
          <ImportantInfo itinerary={itinerary} />
        </div>
      </div>
    </div>
  );
}
