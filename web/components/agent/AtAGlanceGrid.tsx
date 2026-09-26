import { AGENT_COPY } from "@/lib/agent/content";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { tripTypeLabel } from "@/lib/trips/tripType";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-label text-[var(--md-on-surface-variant)]">{label}</div>
      <div className="t-body mt-0.5">{value}</div>
    </div>
  );
}

/**
 * The prototype's 4-column "at a glance" grid. No "Booking source" field — the prototype
 * draws one and no such column exists on `trip` anywhere in the schema; see
 * `agent_trip_overview`'s doc comment.
 */
export function AtAGlanceGrid({ overview }: { overview: TripDetailOverview }) {
  const dates =
    overview.startLabel && overview.endLabel
      ? `${overview.startLabel} – ${overview.endLabel}`
      : (overview.startLabel ?? overview.endLabel ?? AGENT_COPY.glanceNotSet);

  return (
    <div className="card p-3.5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={AGENT_COPY.glanceTripType} value={tripTypeLabel(overview.tripType)} />
        <Field
          label={AGENT_COPY.glanceDestination}
          value={
            overview.destinations.length > 0
              ? overview.destinations.join(", ")
              : AGENT_COPY.glanceNotSet
          }
        />
        <Field
          label={AGENT_COPY.glanceTravelers}
          value={`${overview.travelerCount} ${overview.travelerCount === 1 ? "traveler" : "travelers"}`}
        />
        <Field label={AGENT_COPY.glanceDates} value={dates} />
        <Field
          label={AGENT_COPY.glanceCardOnFile}
          value={overview.cardOnFile ?? AGENT_COPY.glanceNoCard}
        />
        <Field
          label={AGENT_COPY.glanceLastActivity}
          value={overview.lastActivityLabel ?? AGENT_COPY.glanceNoActivity}
        />
        {overview.cancellationReason && (
          <Field label={AGENT_COPY.glanceCancellationReason} value={overview.cancellationReason} />
        )}
        {overview.refundStatus && (
          <Field label={AGENT_COPY.glanceRefundStatus} value={overview.refundStatus} />
        )}
      </div>
    </div>
  );
}
