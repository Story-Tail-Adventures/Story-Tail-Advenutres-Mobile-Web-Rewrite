import { AGENT_COPY } from "@/lib/agent/content";
import type { TripPaymentRow } from "@/lib/agent/tripDetail";

/**
 * The prototype's "Payments" sidebar card — a status dot per milestone (green = paid, red =
 * everything else, since `payment_milestone.status` has no separate risk model beyond paid).
 *
 * Reused by the Payments tab with `full`, which renders every row rather than the sidebar's
 * top three — one read (`agent_trip_payments`), two renderings, rather than a second
 * accessor for a summary the tab already lists in full.
 */
export function PaymentsSummaryCard({
  payments,
  full = false,
}: {
  payments: TripPaymentRow[];
  full?: boolean;
}) {
  const rows = full ? payments : payments.filter((p) => p.status !== "paid").slice(0, 3);

  // TWO EMPTY STATES, NOT ONE. The sidebar hides paid milestones, so `rows` empties both
  // when a trip has no schedule at all and when every milestone on it has been paid — and
  // those are opposite facts. Collapsing them told an advisor "No payments scheduled." on a
  // trip that had been paid for in full, which is the one reading of that card nobody could
  // act on. `payments` is the unfiltered set, so it is what decides which sentence applies.
  const emptyCopy =
    payments.length === 0 ? AGENT_COPY.tripPaymentsEmpty : AGENT_COPY.tripPaymentsAllSettled;

  return (
    <div className="card p-3.5">
      <p className="t-title-s">Payments</p>
      {rows.length === 0 ? (
        <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">{emptyCopy}</p>
      ) : (
        rows.map((p) => (
          <div key={p.milestoneId} className="flex items-center gap-2 py-1.5">
            <span
              className="dot"
              aria-hidden="true"
              style={{ background: p.dot === "good" ? "var(--md-success)" : "var(--md-error)" }}
            />
            <div className="t-body-s flex-1">
              {p.label} · {p.status === "paid" ? "Paid" : p.dueLabel ?? "No date"}
            </div>
            <span className="font-mono text-xs font-bold">{p.amountLabel}</span>
          </div>
        ))
      )}
    </div>
  );
}
