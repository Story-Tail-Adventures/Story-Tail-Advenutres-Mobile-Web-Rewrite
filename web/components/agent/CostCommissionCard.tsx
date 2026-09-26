import { AGENT_COPY } from "@/lib/agent/content";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";

/** The prototype's "Cost & commission" sidebar card, from `agent_trip_overview`'s figures. */
export function CostCommissionCard({ overview }: { overview: TripDetailOverview }) {
  return (
    <div className="card p-3.5">
      <p className="t-title-s">{AGENT_COPY.costCommissionTitle}</p>
      <div className="mt-2 flex justify-between text-[12.5px] font-medium">
        <span className="text-[var(--md-on-surface-variant)]">{AGENT_COPY.clientTotalLabel}</span>
        <span className="font-bold">{overview.totalValueLabel}</span>
      </div>
      <div className="flex justify-between text-[12.5px] font-medium">
        <span className="text-[var(--md-on-surface-variant)]">{AGENT_COPY.paidSoFarLabel}</span>
        <span>{overview.totalPaidLabel}</span>
      </div>
      <div className="mt-1 flex justify-between text-base font-bold text-[var(--md-primary)]">
        <span>{AGENT_COPY.commissionLabel}</span>
        <span>{overview.totalCommissionLabel}</span>
      </div>
    </div>
  );
}
