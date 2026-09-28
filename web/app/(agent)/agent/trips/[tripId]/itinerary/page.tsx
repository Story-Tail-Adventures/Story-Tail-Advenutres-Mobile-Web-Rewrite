import Link from "next/link";

import { ItineraryDayList } from "@/components/agent/ItineraryDayList";
import {
  ActivityForm,
  DayForm,
  GenerateItineraryButton,
} from "@/components/agent/ItineraryForms";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import { ITINERARY_COPY } from "@/lib/agent/content";
import {
  emptyActivity,
  emptyDay,
  type ActivityValues,
  type DayValues,
} from "@/lib/agent/itinerary";
import {
  loadTripItinerary,
  loadTripOverview,
  type TripItineraryActivity,
  type TripItineraryDay,
} from "@/lib/agent/tripDetail";

/**
 * Screen 3.4.14 — Itinerary Editor.
 *
 * ONE ROUTE, THE OPEN FORM IN THE URL, the same shape §3.4.2's `?tab=` and §3.4.4's `?add=`
 * use. Four states, and at most one form is ever open:
 *
 *   ?activity=<id>  edit that entry          ?addTo=<dayId>  a new entry on that day
 *   ?day=<id>       edit that day            ?addDay=1       a new day
 *
 * The back button closes whichever is open, a link can point straight at one, and the whole
 * page renders on the server.
 *
 * THE DAY GROUPING LIVES HERE AND NOT IN §3.4.4. `itinerary_day` is a real table with a
 * date and a label; the builder's component list has no day in it. The design prototype
 * draws the days inside the builder and the Screen Inventory lists them as separate screens
 * — the doc hierarchy puts the text above the drawing, recorded in §3.4.4's own amendment.
 */

export const metadata = { title: "Itinerary" };

function activityValues(a: TripItineraryActivity, dayId: string): ActivityValues {
  return {
    activityId: a.activityId,
    dayId,
    title: a.title,
    // The stored block, NOT the derived one — an advisor who set `all_day` on a timed entry
    // meant it, and re-deriving would quietly undo that on the next save.
    block: a.block ?? "",
    startTime: a.edit.startTime ?? "",
    endTime: a.edit.endTime ?? "",
    body: a.body ?? "",
    location: a.location ?? "",
    address: a.edit.address ?? "",
    phone: a.edit.phone ?? "",
    confirmationNumber: a.confirmationNumber ?? "",
    gyasisTip: a.gyasisTip ?? "",
  };
}

function dayValues(d: TripItineraryDay): DayValues {
  return {
    dayId: d.dayId,
    date: d.date ?? "",
    label: d.label ?? "",
    summary: d.summary ?? "",
  };
}

/**
 * The day after the last one, so "Add a day" opens on the date an advisor probably wants.
 *
 * A SUGGESTION AND NOTHING MORE — the field is editable and empty is valid on an edit. It
 * deliberately does NOT reach for the trip's start date: `TripDetailOverview` carries
 * `startLabel` (already formatted for display) and not the raw ISO date, and formatting a
 * label back into a date to prefill a field is the kind of round trip that works until a
 * locale changes. With no days yet the advisor picks, which is one click.
 *
 * UTC arithmetic, not local: `new Date("2026-12-07")` is midnight UTC, and adding a day in
 * local time lands on the 6th or the 8th depending on the advisor's offset.
 */
function suggestedDate(days: TripItineraryDay[]): string {
  const dates = days.map((d) => d.date).filter((x): x is string => Boolean(x)).sort();
  const last = dates.at(-1);
  if (!last) return "";
  const next = new Date(`${last}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const iso = next.toISOString().slice(0, 10);
  return dates.includes(iso) ? "" : iso;
}

export default async function TripItineraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ activity?: string; addTo?: string; day?: string; addDay?: string }>;
}) {
  const { tripId } = await params;
  const { activity, addTo, day, addDay } = await searchParams;

  const [result, itinerary] = await Promise.all([
    loadTripOverview(tripId),
    loadTripItinerary(tripId),
  ]);

  // A trip that is not there is not an error — `agent_trip_overview` answers zero rows for
  // "no such trip" and "not yours" alike, deliberately.
  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !itinerary) return <ErrorState />;

  const overview = result.overview;
  const days = itinerary.days;

  // Which form is open, resolved in one place and in priority order — an `?activity=` that
  // names a row that is gone falls through to no form rather than to a blank one, because
  // opening an empty "add" over a deleted entry invites the advisor to type it back in.
  let openActivity: { values: ActivityValues; fromBooking: boolean } | null = null;
  let openDay: DayValues | null = null;

  if (activity) {
    for (const d of days) {
      const found = d.activities.find((a) => a.activityId === activity);
      if (found) {
        openActivity = {
          values: activityValues(found, d.dayId),
          fromBooking: found.componentId !== null,
        };
        break;
      }
    }
  } else if (addTo && days.some((d) => d.dayId === addTo)) {
    openActivity = { values: emptyActivity(addTo), fromBooking: false };
  } else if (day) {
    const found = days.find((d) => d.dayId === day);
    if (found) openDay = dayValues(found);
  } else if (addDay) {
    openDay = emptyDay(suggestedDate(days));
  }

  const activityCount = days.reduce((n, d) => n + d.activities.length, 0);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8">
      <header className="card mt-5 p-4">
        <p className="t-body-s text-[var(--md-on-surface-variant)]">
          <Link href={`/agent/trips/${tripId}`} className="hover:underline">
            {ITINERARY_COPY.backToTrip}
          </Link>{" "}
          · {overview.clientName}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="t-headline text-[22px] leading-tight">{overview.title}</h1>
          {/* Published or draft, never blank — an advisor must know whether the client can
              already see what they are editing. `publishedLabel` is computed by the loader
              for exactly this. */}
          <span className="kbd">{itinerary.publishedLabel}</span>
        </div>
        <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
          {days.length} {days.length === 1 ? ITINERARY_COPY.dayCountOne : ITINERARY_COPY.dayCount}
          {" · "}
          {activityCount}{" "}
          {activityCount === 1 ? ITINERARY_COPY.activityCountOne : ITINERARY_COPY.activityCount}
        </p>

        <div className="mt-3">
          <GenerateItineraryButton tripId={tripId} />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="t-title-s">{ITINERARY_COPY.title}</h2>
            <Link
              href={`/agent/trips/${tripId}/itinerary?addDay=1`}
              className="btn btn-tonal btn-sm"
            >
              {ITINERARY_COPY.addDay}
            </Link>
          </div>
          <ItineraryDayList
            tripId={tripId}
            days={days}
            editingActivityId={openActivity?.values.activityId || null}
            editingDayId={openDay?.dayId || null}
          />
        </section>

        {/* The rail exists only when a form is open. An empty 380px column beside the days
            is a panel the advisor has to learn to ignore. */}
        {openActivity && (
          <ActivityForm
            key={openActivity.values.activityId || `new-${openActivity.values.dayId}`}
            tripId={tripId}
            initial={openActivity.values}
            fromBooking={openActivity.fromBooking}
            days={days.map((d) => ({
              dayId: d.dayId,
              dayNumber: d.dayNumber,
              dateLabel: d.dateLabel,
            }))}
          />
        )}
        {openDay && (
          <DayForm key={openDay.dayId || "new-day"} tripId={tripId} initial={openDay} />
        )}
      </div>
    </div>
  );
}
