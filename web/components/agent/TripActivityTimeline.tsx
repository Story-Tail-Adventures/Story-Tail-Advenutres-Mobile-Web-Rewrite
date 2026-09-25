import { AGENT_COPY } from "@/lib/agent/content";
import type { TripActivityRow } from "@/lib/agent/tripDetail";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

function statusLabel(status: string): string {
  return tripStatusPresentation({
    status: status as TripStatus,
    nextUnpaidDueDate: null,
    today: "",
  }).label;
}

/**
 * The business timeline (`trip_status_history`), not the forensic audit trail. See
 * `agent_trip_activity`'s doc comment for why the two are kept apart.
 */
export function TripActivityTimeline({ activity }: { activity: TripActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {AGENT_COPY.tripActivityEmpty}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {activity.map((h) => (
        <li key={h.historyId} className="card flex items-center gap-3 p-3">
          <span
            className="size-2 shrink-0 self-stretch rounded-full bg-[var(--md-primary-container)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="t-title-s text-[13px]">
              {h.fromLabel ? `${statusLabel(h.fromLabel)} → ${statusLabel(h.toLabel)}` : statusLabel(h.toLabel)}
            </p>
            <p className="t-body-s text-[var(--md-on-surface-variant)]">{h.changedByName}</p>
          </div>
          <span className="t-body-s text-[var(--md-on-surface-variant)]">{h.changedAtLabel}</span>
        </li>
      ))}
    </ol>
  );
}
