import Link from "next/link";

import {
  deleteActivityAction,
  moveActivityAction,
} from "@/app/(agent)/agent/trips/[tripId]/itinerary/actions";
import { Icon } from "@/components/ui/Icon";
import { ITINERARY_COPY } from "@/lib/agent/content";
import type { TripItineraryDay } from "@/lib/agent/tripDetail";

/**
 * §3.4.14's day-by-day canvas — the grouping §3.4.4 deliberately does not have.
 *
 * THESE DAYS ARE REAL ROWS. `itinerary_day` is a table with a date and a label; the
 * builder's flat component list has no day in it, which is why the two screens are
 * separate and why §3.4.4's amendment says so. What ties them is
 * `itinerary_activity.component_id`, one-directional: an entry may point at a booking, a
 * booking does not know its entry.
 *
 * ARROWS, NOT A DRAG HANDLE. The prototype draws drag-to-reorder and a drag is pointer-only,
 * so the accessible path would be these buttons anyway — and they work with JavaScript off,
 * on the screen where an advisor does the most typing. Same call the builder made.
 *
 * A SERVER COMPONENT: three plain forms and two links, none of which needs state.
 */
export function ItineraryDayList({
  tripId,
  days,
  editingActivityId,
  editingDayId,
}: {
  tripId: string;
  days: TripItineraryDay[];
  editingActivityId: string | null;
  editingDayId: string | null;
}) {
  if (days.length === 0) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="t-title-s">{ITINERARY_COPY.emptyTitle}</p>
        <p className="t-body-s mx-auto mt-1 max-w-[46ch] text-[var(--md-on-surface-variant)]">
          {ITINERARY_COPY.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => (
        <section
          key={day.dayId}
          className={`card p-3.5 ${
            day.dayId === editingDayId
              ? "border-[var(--md-primary)] bg-[var(--md-primary-container)]"
              : ""
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* The script face on the day number, which is how the prototype draws it and
                the one place Caveat earns its place on an agent screen. */}
            <p className="t-script text-[26px] leading-none text-[var(--brand-burgundy)]">
              Day {day.dayNumber}
            </p>
            {day.dateLabel && (
              <p className="t-body-s text-[var(--md-on-surface-variant)]">{day.dateLabel}</p>
            )}
            {day.label && <p className="t-title-s">{day.label}</p>}
            <div className="ml-auto flex items-center gap-1">
              <Link
                href={`/agent/trips/${tripId}/itinerary?day=${day.dayId}`}
                className="btn btn-text btn-sm"
              >
                {ITINERARY_COPY.edit}
                <span className="sr-only"> Day {day.dayNumber}</span>
              </Link>
              <Link
                href={`/agent/trips/${tripId}/itinerary?addTo=${day.dayId}`}
                className="btn btn-tonal btn-sm"
              >
                {ITINERARY_COPY.addToDay}
                <span className="sr-only"> — Day {day.dayNumber}</span>
              </Link>
            </div>
          </div>

          {day.summary && (
            <p className="t-body-s mt-1.5 text-[var(--md-on-surface-variant)]">{day.summary}</p>
          )}

          {day.activities.length === 0 ? (
            <p className="t-body-s mt-2.5 text-[var(--md-on-surface-variant)]">
              {ITINERARY_COPY.dayEmpty}
            </p>
          ) : (
            <ol className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
              {day.activities.map((a, i) => (
                <li
                  key={a.activityId}
                  className={`flex flex-wrap items-start gap-x-2.5 gap-y-1.5 rounded-xl border px-3 py-2 ${
                    a.activityId === editingActivityId
                      ? "border-[var(--md-primary)] bg-[var(--md-surface-2)]"
                      : "border-[var(--md-outline-variant)]"
                  }`}
                  aria-current={a.activityId === editingActivityId ? "true" : undefined}
                >
                  <div className="flex flex-col">
                    <MoveButton
                      tripId={tripId}
                      dayId={day.dayId}
                      activityId={a.activityId}
                      direction="up"
                      label={ITINERARY_COPY.moveUp}
                      title={a.title}
                      disabled={i === 0}
                    />
                    <MoveButton
                      tripId={tripId}
                      dayId={day.dayId}
                      activityId={a.activityId}
                      direction="down"
                      label={ITINERARY_COPY.moveDown}
                      title={a.title}
                      disabled={i === day.activities.length - 1}
                    />
                  </div>

                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="t-title-s text-[13px]">{a.title}</p>
                    <p className="t-body-s text-[var(--md-on-surface-variant)]">
                      {[a.timeLabel, a.block, a.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {a.body && <p className="t-body-s mt-1">{a.body}</p>}
                    {a.gyasisTip && (
                      /* The named callout, styled as one. Design-System §2 makes
                         "Gyasi's Tip" a thing rather than a generic note. */
                      <p className="t-body-s mt-1.5 rounded-lg bg-[var(--md-tertiary-container)] px-2.5 py-1.5 text-[var(--md-on-tertiary-container)]">
                        <span className="t-label-s">{ITINERARY_COPY.tipLabel}</span>{" "}
                        {a.gyasisTip}
                      </p>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-1.5">
                    {a.componentId && (
                      <span className="kbd" title={ITINERARY_COPY.fromBookingHint}>
                        {ITINERARY_COPY.fromBooking}
                      </span>
                    )}
                    <Link
                      href={`/agent/trips/${tripId}/itinerary?activity=${a.activityId}`}
                      className="btn btn-text btn-sm"
                    >
                      {ITINERARY_COPY.edit}
                      <span className="sr-only"> {a.title}</span>
                    </Link>
                    <form action={deleteActivityAction}>
                      <input type="hidden" name="tripId" value={tripId} />
                      <input type="hidden" name="activityId" value={a.activityId} />
                      <button
                        type="submit"
                        className="btn-icon size-7"
                        title={ITINERARY_COPY.removeHint}
                      >
                        <Icon name="trash" size={13} />
                        <span className="sr-only">
                          {ITINERARY_COPY.remove} {a.title} — {ITINERARY_COPY.removeHint}
                        </span>
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

function MoveButton({
  tripId,
  dayId,
  activityId,
  direction,
  label,
  title,
  disabled,
}: {
  tripId: string;
  dayId: string;
  activityId: string;
  direction: "up" | "down";
  label: string;
  title: string;
  disabled: boolean;
}) {
  return (
    <form action={moveActivityAction}>
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        className="btn-icon size-5 disabled:opacity-25"
        title={label}
      >
        <Icon name={direction === "up" ? "chevron_up" : "chevron_down"} size={11} />
        <span className="sr-only">
          {label} — {title}
        </span>
      </button>
    </form>
  );
}
