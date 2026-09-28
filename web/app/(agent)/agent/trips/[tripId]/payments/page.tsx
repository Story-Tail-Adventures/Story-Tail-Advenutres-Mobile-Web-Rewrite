import Link from "next/link";

import { MilestoneForm } from "@/components/agent/MilestoneForm";
import { PaymentScheduleTable } from "@/components/agent/PaymentScheduleTable";
import { TripNotFound } from "@/components/agent/TripNotFound";
import { ErrorState } from "@/components/client/states";
import { Icon } from "@/components/ui/Icon";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import {
  centsToDollars,
  isMilestoneKind,
  type MilestoneValues,
} from "@/lib/agent/payments";
import { formatTripMoney } from "@/lib/trips/money";
import {
  loadTripOverview,
  loadTripPayments,
  type TripPaymentRow,
} from "@/lib/agent/tripDetail";

/**
 * Screen 3.4.15 — Trip Payment Schedule.
 *
 * ITS OWN ROUTE, not an editor grafted onto §3.4.2's Payments tab, matching what §3.4.4 did
 * for components. The tab stays a read — it is one of eight on a screen about the whole
 * trip — and this is where the schedule is worked on. `?edit=<id>` opens a row in the form,
 * the same URL-as-state shape `?tab=` and `?add=` already use.
 *
 * "TRIGGER REMINDER" AND THE CADENCE TOGGLE FROM THE INVENTORY ARE NOT BUILT. §3.10 is
 * agent messaging and nothing in the schema can send on the client's behalf yet. The button
 * renders disabled with its reason, which is the call §3.4.2's "Account admin" tab got —
 * §3.10 is a real planned section, so a disabled control is an honest promise.
 */

export const metadata = { title: "Payment schedule" };

function editValues(row: TripPaymentRow): MilestoneValues {
  return {
    milestoneId: row.milestoneId,
    kind: isMilestoneKind(row.kind) ? row.kind : "deposit",
    label: row.label,
    amount: centsToDollars(row.edit.amountCents),
    dueDate: row.edit.dueDate ?? "",
  };
}

export default async function TripPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { tripId } = await params;
  const { edit } = await searchParams;

  const [result, payments] = await Promise.all([
    loadTripOverview(tripId),
    loadTripPayments(tripId),
  ]);

  // A trip that is not there is not an error — `agent_trip_overview` answers zero rows for
  // "no such trip" and "not yours" alike, deliberately.
  if (!result.ok && result.reason === "not-found") return <TripNotFound />;
  if (!result.ok || !payments) return <ErrorState />;

  const overview = result.overview;
  const editingRow = edit ? payments.find((p) => p.milestoneId === edit) : undefined;

  // Summed here rather than read off the trip, and the two answer different questions.
  // `trip.total_paid_cents` is what has been PAID and it is trigger-maintained from these
  // same rows; this is what the schedule EXPECTS, which nothing stores because a schedule
  // is allowed to be incomplete.
  const expectedCents = payments.reduce((sum, p) => sum + Number(p.edit.amountCents || 0), 0);
  const paidCents = payments.reduce((sum, p) => sum + Number(p.edit.paidCents || 0), 0);
  const currency = "USD";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8">
      <header className="card mt-5 p-4">
        <p className="t-body-s text-[var(--md-on-surface-variant)]">
          <Link href={`/agent/trips/${tripId}`} className="hover:underline">
            {SCHEDULE_COPY.backToTrip}
          </Link>{" "}
          · {overview.clientName}
        </p>
        <h1 className="t-headline mt-1 text-[22px] leading-tight">{overview.title}</h1>
        <p className="t-body-s mt-0.5 text-[var(--md-on-surface-variant)]">
          {SCHEDULE_COPY.subtitle}
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {SCHEDULE_COPY.totalExpected}
            </dt>
            <dd className="t-title-s m-0 font-mono">
              {formatTripMoney(expectedCents, currency, { whole: true })}
            </dd>
          </div>
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {SCHEDULE_COPY.totalPaid}
            </dt>
            <dd className="t-title-s m-0 font-mono">
              {formatTripMoney(paidCents, currency, { whole: true })}
            </dd>
          </div>
          <div>
            <dt className="t-label text-[var(--md-on-surface-variant)]">
              {SCHEDULE_COPY.totalTrip}
            </dt>
            <dd className="t-title-s m-0 font-mono">{overview.totalValueLabel}</dd>
          </div>
        </dl>
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
          <Icon name="info" size={12} /> {SCHEDULE_COPY.totalsHint}
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="t-title-s">{SCHEDULE_COPY.title}</h2>
            <button
              type="button"
              disabled
              title={SCHEDULE_COPY.remindDeferred}
              className="btn btn-outlined btn-sm"
            >
              {SCHEDULE_COPY.remindLabel}
              <span className="sr-only"> — {SCHEDULE_COPY.remindDeferred}</span>
            </button>
          </div>
          <PaymentScheduleTable
            tripId={tripId}
            payments={payments}
            editingId={editingRow?.milestoneId ?? null}
          />
        </section>

        <MilestoneForm
          tripId={tripId}
          // `key` forces a fresh form when the row being edited changes. Without it React
          // keeps the mounted instance and its `useActionState` values, so clicking Edit on
          // a second row would show the first row's fields over the second row's id.
          key={editingRow?.milestoneId ?? "new"}
          initial={editingRow ? editValues(editingRow) : undefined}
        />
      </div>
    </div>
  );
}
