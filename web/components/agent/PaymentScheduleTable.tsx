import Link from "next/link";

import {
  deleteMilestoneAction,
  setMilestoneStatusAction,
} from "@/app/(agent)/agent/trips/[tripId]/payments/actions";
import { Icon } from "@/components/ui/Icon";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import { MILESTONE_STATUSES, centsToDollars } from "@/lib/agent/payments";
import type { TripPaymentRow } from "@/lib/agent/tripDetail";

/**
 * §3.4.15's schedule rows.
 *
 * THE STATUS CONTROL IS A SELECT PLUS A SUBMIT, not four buttons and not a checkbox. The
 * Screen Inventory's Primary elements line says "paid Y/N", and `payment_milestone_status`
 * has four values — `waived` is not `scheduled` and an advisor has to be able to say so.
 * A checkbox would make two of the four unreachable.
 *
 * THE "AMOUNT THAT ARRIVED" FIELD SITS BESIDE IT because §9.5 says partial payments happen,
 * and blank means the whole amount. One form, so the status and the amount can never be
 * submitted apart — which is the same reason the SQL moves `status`, `paid_cents` and
 * `paid_at` together.
 *
 * A SERVER COMPONENT. Every control is a write that navigates; none needs state between
 * renders, so there is no client island here at all.
 */
export function PaymentScheduleTable({
  tripId,
  payments,
  editingId,
}: {
  tripId: string;
  payments: TripPaymentRow[];
  editingId: string | null;
}) {
  if (payments.length === 0) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="t-title-s">{SCHEDULE_COPY.emptyTitle}</p>
        <p className="t-body-s mx-auto mt-1 max-w-[44ch] text-[var(--md-on-surface-variant)]">
          {SCHEDULE_COPY.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <ol className="flex list-none flex-col gap-1.5 p-0">
      {payments.map((p) => {
        const isEditing = p.milestoneId === editingId;
        return (
          <li
            key={p.milestoneId}
            className={`card flex flex-wrap items-start gap-x-3 gap-y-2 px-3.5 py-3 ${
              isEditing ? "border-[var(--md-primary)] bg-[var(--md-primary-container)]" : ""
            }`}
            aria-current={isEditing ? "true" : undefined}
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="t-title-s text-[13px]">{p.label}</p>
              <p className="t-body-s text-[var(--md-on-surface-variant)]">
                {[
                  p.dueLabel ? `${SCHEDULE_COPY.colDue} ${p.dueLabel}` : null,
                  // Only on a row that has actually been paid. A `paid_at` on anything else
                  // would be a date for a payment the row no longer records — which is why
                  // the write clears it.
                  p.status === "paid" && p.paidOnLabel ? `Paid ${p.paidOnLabel}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>

            <div className="text-right font-mono text-xs font-bold">
              {p.amountLabel}
              {/* Shown only when it differs from the amount: an advisor scanning the
                  schedule needs to spot a partial payment, and repeating the same figure
                  on every settled row buries it. */}
              {p.status === "paid" && p.paidLabel !== p.amountLabel && (
                <span className="block font-normal text-[var(--md-on-surface-variant)]">
                  {p.paidLabel} {SCHEDULE_COPY.colPaid.toLowerCase()}
                </span>
              )}
            </div>

            {/* ── Status + what arrived ─────────────────────────────── */}
            <form action={setMilestoneStatusAction} className="flex items-center gap-1.5">
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="milestoneId" value={p.milestoneId} />
              <label className="sr-only" htmlFor={`status-${p.milestoneId}`}>
                {SCHEDULE_COPY.markLabel} — {p.label}
              </label>
              <select
                id={`status-${p.milestoneId}`}
                name="status"
                defaultValue={p.status}
                className="input h-8 rounded-lg px-2 text-xs"
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value} title={s.hint}>
                    {s.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`paid-${p.milestoneId}`}>
                {SCHEDULE_COPY.markPaidAmount} — {p.label}
              </label>
              <input
                id={`paid-${p.milestoneId}`}
                name="paidAmount"
                inputMode="decimal"
                // Prefilled only on a paid row, and only when it was partial. On anything
                // else a prefilled figure would look like a payment already recorded.
                defaultValue={
                  p.status === "paid" && p.paidLabel !== p.amountLabel
                    ? centsToDollars(p.edit.paidCents)
                    : ""
                }
                placeholder={SCHEDULE_COPY.colAmount}
                className="input h-8 w-20 rounded-lg px-2 font-mono text-xs"
              />
              <button type="submit" className="btn btn-tonal btn-sm">
                {SCHEDULE_COPY.markApply}
              </button>
            </form>

            <Link
              href={`/agent/trips/${tripId}/payments?edit=${p.milestoneId}`}
              className="btn btn-text btn-sm"
            >
              {SCHEDULE_COPY.edit}
              <span className="sr-only"> {p.label}</span>
            </Link>

            <form action={deleteMilestoneAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="milestoneId" value={p.milestoneId} />
              <button type="submit" className="btn-icon size-7" title={SCHEDULE_COPY.removeHint}>
                <Icon name="trash" size={13} />
                <span className="sr-only">
                  {SCHEDULE_COPY.remove} {p.label} — {SCHEDULE_COPY.removeHint}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ol>
  );
}
