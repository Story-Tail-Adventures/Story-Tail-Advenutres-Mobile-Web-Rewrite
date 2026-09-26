import { AGENT_COPY } from "@/lib/agent/content";
import type { TripItineraryView as TripItinerary } from "@/lib/agent/tripDetail";

const BLOCK_LABEL: Record<string, string> = {
  morning: "MORNING",
  afternoon: "AFTERNOON",
  evening: "EVENING",
  all_day: "ALL DAY",
};

export function TripItineraryView({ itinerary }: { itinerary: TripItinerary }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="chip">{itinerary.publishedLabel}</span>
      </div>

      {itinerary.days.length === 0 ? (
        <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.tripItineraryEmpty}
        </p>
      ) : (
        itinerary.days.map((day) => (
          <div key={day.dayId} className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="t-script text-[22px] leading-none text-[var(--brand-burgundy)]">
                Day {day.dayNumber}
              </span>
              {day.label && <span className="t-title-s">{day.label}</span>}
              {day.dateLabel && (
                <span className="t-body-s text-[var(--md-on-surface-variant)]">{day.dateLabel}</span>
              )}
            </div>
            {day.summary && (
              <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">{day.summary}</p>
            )}
            <div className="mt-2 flex flex-col gap-2">
              {day.activities.map((a) => (
                <div key={a.activityId} className="card p-3">
                  <div className="flex items-center gap-2">
                    {a.block && (
                      <span className="t-label-s text-[var(--brand-orange)]">
                        {BLOCK_LABEL[a.block] ?? a.block.toUpperCase()}
                      </span>
                    )}
                    <span className="t-title-s flex-1 text-[13px]">
                      {a.timeLabel ? `${a.timeLabel} · ` : ""}
                      {a.title}
                    </span>
                  </div>
                  {a.body && <p className="t-body-s mt-1">{a.body}</p>}
                  {a.gyasisTip && (
                    <div className="mt-2 flex items-start gap-2 rounded-[8px] bg-[var(--md-tertiary-container)] p-2 text-[var(--md-on-tertiary-container)]">
                      <span className="t-label-s shrink-0">GYASI&apos;S TIP</span>
                      <span className="t-body-s">{a.gyasisTip}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
