import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/ui/Icon";
import { formatTripDates } from "@/lib/trips/format";
import { formatTripMoney } from "@/lib/trips/money";
import { loadStatusChange } from "@/lib/trips/queries";
import { STATUS_CHANGE } from "./content";

export const metadata: Metadata = { title: "Trip update" };

/**
 * Screen 2.2.9 Trip Status Change Notification View — docs/Screen-Inventory.md §2.2.9, and
 * design/source-prototype/screens/client-trip.jsx (C229_StatusChange) +
 * client-trip-mobile.jsx (M229_StatusChange). P1.
 *
 * A ROUTE, NOT A SHEET, and that is the one place this departs from both artboards. They draw
 * it as a bottom sheet over a dimmed dashboard, which is right for the case where a status
 * changes while somebody is already looking at the app. But §2.2.9's own entry points are
 * "push or email notification" — which means the first thing that has to work is a URL
 * arriving cold, from a mail client, on a device where the app was not open. A sheet has no
 * URL. So this is a page, and the sheet presentation is the §2.6 notification-centre concern
 * it actually belongs to.
 *
 * WHAT IT CAN HONESTLY SAY is the real design work here — see the long note in content.ts.
 * The short version: nothing records a status DIFF, so the narrative comes from the status it
 * landed on, and every supporting fact is a real row rendered only when it exists.
 */
export default async function TripUpdatePage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const update = await loadStatusChange(tripId);

  if (!update) notFound();

  const { trip } = update;
  const narrative = STATUS_CHANGE.narrativeFor(trip.status, trip.title);
  const steps = STATUS_CHANGE.nextSteps(trip.status);

  // Only facts with a row behind them. An empty list hides the card rather than printing a
  // heading over nothing.
  const facts: string[] = [];
  if (update.proposal) {
    facts.push(
      STATUS_CHANGE.proposalLine(update.proposal.versionNumber, update.proposal.coverTitle),
    );
  }
  if (update.itineraryReady) facts.push(STATUS_CHANGE.itineraryLine);
  if (update.nextPayment) {
    const money = formatTripMoney(
      update.nextPayment.amountCents,
      update.nextPayment.currency,
    );
    facts.push(
      STATUS_CHANGE.paymentLine(
        update.nextPayment.label,
        money,
        update.nextPayment.dueDate ? formatTripDates(update.nextPayment.dueDate, null) : null,
      ),
    );
  }

  const primary = primaryAction(trip.status, tripId, update.itineraryReady, Boolean(update.proposal));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-10 md:p-6">
      <Link
        href={`/trips/${tripId}`}
        className="t-body-s inline-flex items-center gap-1 text-on-surface-variant"
      >
        <Icon name="arrow_left" size={14} /> {STATUS_CHANGE.back}
      </Link>

      <header className="mt-4">
        <span className="inline-flex h-[54px] w-[54px] items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Icon name="sparkle" size={26} />
        </span>
        <p className="t-label-s mt-3 text-on-surface-variant">
          {narrative.overline} ·{" "}
          {/* An ABSOLUTE date, not "2 min ago". The artboard says "STATUS UPDATED · 2 MIN
              AGO", which is true at the instant the notification fires and a confident lie
              by the time somebody opens the email the next morning. A date cannot go
              stale. */}
          {update.changedAt
            ? formatTripDates(update.changedAt.slice(0, 10), null)
            : STATUS_CHANGE.changedUnknown}
        </p>
        <h1 className="t-headline mt-1">{narrative.heading}</h1>
        <p className="t-body mt-2 max-w-prose text-on-surface-variant">
          {narrative.body}
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-3">
        {facts.length > 0 && (
          <section className="card p-4">
            <h2 className="t-title-s">{STATUS_CHANGE.whatChanged}</h2>
            <ul className="t-body-s mt-1.5 flex flex-col gap-1 text-on-surface-variant">
              {facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-4">
          <h2 className="t-title-s">{STATUS_CHANGE.whatsNext}</h2>
          <ol className="t-body-s mt-1.5 list-decimal pl-5 leading-relaxed text-on-surface-variant">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <Link href={primary.href} className="btn btn-filled w-full">
          {primary.label} <Icon name="arrow_right" size={13} />
        </Link>

        {/* §2.4 is Phase 1 and next, so the payment CTA the artboard shows renders disabled
            rather than being dropped — the plan's "build them visually, disabled" decision. */}
        {update.nextPayment && (
          <button
            type="button"
            className="btn btn-outlined w-full"
            disabled
            aria-disabled="true"
            title={STATUS_CHANGE.authorizeDeferred}
          >
            <Icon name="card" size={14} /> {STATUS_CHANGE.authorizeCard}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The single CTA §2.2.9 asks for: "CTA to view the relevant section".
 *
 * Relevant means "the thing that just changed", and it falls back to the trip overview
 * rather than to a screen that would be empty — a proposal CTA with no sent proposal behind
 * it is the exact kind of dead end this screen is supposed to resolve.
 */
function primaryAction(
  status: string,
  tripId: string,
  itineraryReady: boolean,
  hasProposal: boolean,
): { href: string; label: string } {
  if (status === "proposal" && hasProposal) {
    // §2.2.12 Proposal Viewer is not built, so this lands on the overview, which is where
    // the proposal's own facts are already shown.
    return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewProposal };
  }
  if (status === "completed") {
    return { href: `/trips/${tripId}/memories`, label: STATUS_CHANGE.viewMemories };
  }
  if (status === "cancelled") {
    return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewSummary };
  }
  if (itineraryReady) {
    return { href: `/trips/${tripId}/itinerary`, label: STATUS_CHANGE.viewItinerary };
  }
  return { href: `/trips/${tripId}`, label: STATUS_CHANGE.viewTrip };
}
