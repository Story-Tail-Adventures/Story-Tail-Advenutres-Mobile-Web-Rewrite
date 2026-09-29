import Link from "next/link";

import { CancelTripDialog } from "@/components/agent/CancelTripDialog";
import { SaveAsTemplateDialog } from "@/components/agent/SaveAsTemplateDialog";
import { StageMenu } from "@/components/agent/StageMenu";
import { AGENT_COPY } from "@/lib/agent/content";
import { PIPELINE_STAGES } from "@/lib/agent/queries";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { tripStatusPresentation, type TripStatus } from "@/lib/trips/status";

/**
 * Screen 3.4.2's header: breadcrumb, title, status chip, and four actions.
 *
 * "BUILD" IS THE PRIMARY ACTION AND THE REST STILL WAIT. §3.4.4's own Screen-Inventory
 * entry names this header as one of its two entry points ("Trip Detail 'Edit components'"),
 * so the link lives here rather than buried in the Components tab — though that tab gets
 * one too, because that is where an advisor is standing when they decide to change
 * something. Duplicate (§3.4.13), Client preview (§3.5.6) and Send proposal (§3.5) render
 * disabled with a reason, matching `AgentNav.tsx`'s span-not-Link convention for an unbuilt
 * destination — never a silent no-op, never a link to a 404. The
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
          <Link href={`/agent/trips/${overview.tripId}/builder`} className="btn btn-orange btn-sm">
            {AGENT_COPY.openBuilder}
          </Link>
          {/* §3.4.13 HONOURS THIS DEFERRAL RATHER THAN DELETING IT. "Duplicate" was
              disabled reading "Duplicating a trip arrives with §3.4.13, alongside the
              template library it shares the mechanism with" — repointed here during
              §3.4.4 for exactly this reason. Duplicating IS save the pattern, then New
              trip → start from a template: two real screens rather than a third verb
              needing its own client picker and date logic. */}
          <SaveAsTemplateDialog
            tripId={overview.tripId}
            tripTitle={overview.title}
            label={AGENT_COPY.saveAsTemplateLabel}
          />
          <DisabledAction label="Client preview" reason={AGENT_COPY.clientPreviewDeferred} />
          <DisabledAction label="Send proposal" reason={AGENT_COPY.sendProposalDeferred} />
          {/* §3.4.16. Last in the row and outlined rather than filled: it is the one action
              here with a consequence outside this screen, and it should not sit where the
              eye lands first. On a trip that is already cancelled it becomes "Save details",
              because the same dialog is how a refund that was pending becomes full. */}
          <CancelTripDialog overview={overview} />
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
