import Link from "next/link";

import { StageMenu } from "@/components/agent/StageMenu";
import { AGENT_COPY } from "@/lib/agent/content";
import { PIPELINE_STAGES } from "@/lib/agent/queries";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

/**
 * Screen 3.4.2's header: breadcrumb, title, status chip, and four actions.
 *
 * ONLY ONE OF THE FOUR HAS ANYWHERE TO GO. Duplicate (§3.4.4), Client preview (§3.3.2) and
 * Send proposal (§3.5) render disabled with a reason, matching `AgentNav.tsx`'s span-not-Link
 * convention for an unbuilt destination — never a silent no-op, never a link to a 404. The
 * status-change control reuses `StageMenu` verbatim rather than a bespoke "Mark booked"
 * button: it already offers every stage a trip can move to, which is a superset of what a
 * single fixed-target button would do, and it is the same write §3.2.2 already ships.
 */
function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <button type="button" className="btn btn-outlined btn-sm" disabled title={reason}>
      {label}
      <span className="sr-only"> — {reason}</span>
    </button>
  );
}

export function TripDetailHeader({ overview }: { overview: TripDetailOverview }) {
  // THE REAL DATES, not the `null`/`""` pair the other agent surfaces pass. Worklist and
  // Pipeline render a chip for a row that carries no milestone, so they opt out of the
  // payment override deliberately. This screen HAS the milestone, and the entry points that
  // link here already show the urgency — a hero that reads a flat "Booked" while the row you
  // clicked to reach it said the balance was due is the quieter of the two.
  const { chip, label } = tripStatusPresentation({
    status: overview.status as TripStatus,
    nextUnpaidDueDate: overview.nextUnpaidDueDate,
    today: overview.today,
  });

  return (
    <header className="card mt-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-body-s text-[var(--md-on-surface-variant)]">
            <Link href="/agent" className="hover:underline">
              Worklist
            </Link>{" "}
            · {overview.clientName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="t-headline text-[22px] leading-tight">{overview.title}</h1>
            <span className={`chip-status ${chip}`}>{label}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DisabledAction label="Duplicate" reason={AGENT_COPY.duplicateTripDeferred} />
          <DisabledAction label="Client preview" reason={AGENT_COPY.clientPreviewDeferred} />
          <DisabledAction label="Send proposal" reason={AGENT_COPY.sendProposalDeferred} />
        </div>
      </div>
      <div className="mt-3 max-w-xs">
        <StageMenu
          tripId={overview.tripId}
          status={overview.status}
          version={overview.version}
          stages={PIPELINE_STAGES}
        />
      </div>
    </header>
  );
}
