"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { SCHEDULE_COPY } from "@/lib/agent/content";
import {
  dollarsToCents,
  isMilestoneStatus,
  milestoneFromFormData,
  validateMilestone,
  type ScheduleState,
} from "@/lib/agent/payments";

/**
 * §3.4.15's three writes.
 *
 * TWO OF THEM LOOK ALIKE AND ARE NOT. `saveMilestoneAction` changes what the supplier
 * expects; `setMilestoneStatusAction` changes whether the money moved. Only the second can
 * reach `trip.total_paid_cents`, which since 20260929100000 is a trigger-maintained sum and
 * is what `wallet/authorize/[tripId]` subtracts from the trip value to show a traveler
 * their outstanding balance. Keeping them apart at every layer — SQL, route, action, form —
 * is what makes a label edit incapable of moving that number.
 */

function schedulePath(tripId: string): string {
  return `/agent/trips/${tripId}/payments`;
}

function revalidateTrip(tripId: string): void {
  revalidatePath(schedulePath(tripId));
  revalidatePath(`/agent/trips/${tripId}`);
  // The roster and the worklist both render a next-payment-due chip off this schedule, and
  // §2.2.3 renders it to the traveler.
  revalidatePath("/agent/trips");
  revalidatePath("/agent");
  revalidatePath(`/trips/${tripId}`);
}

/** Add or edit a scheduled payment. Never touches what has been paid. */
export async function saveMilestoneAction(
  _prev: ScheduleState,
  form: FormData,
): Promise<ScheduleState> {
  const tripId = (form.get("tripId") ?? "").toString();
  if (!tripId) return { formError: SCHEDULE_COPY.failed };

  const values = milestoneFromFormData(form);

  const fieldErrors = validateMilestone(values);
  if (fieldErrors) return { fieldErrors, values };

  const call = await callAgentFunction("agent-trip", {
    op: "payment_upsert",
    tripId,
    milestoneId: values.milestoneId || undefined,
    kind: values.kind,
    label: values.label,
    // Validated above, so the `?? 0` is unreachable except by a race with the check.
    amountCents: dollarsToCents(values.amount) ?? 0,
    dueDate: values.dueDate || undefined,
  });

  if (!call.ok) {
    return {
      formError: call.kind === "rejected"
        ? (call.detail ?? SCHEDULE_COPY.failed)
        : SCHEDULE_COPY.failed,
      values,
    };
  }

  revalidateTrip(tripId);
  redirect(schedulePath(tripId));
}

/**
 * Mark a payment paid, scheduled, overdue or waived.
 *
 * A PLAIN FORM POST rather than `useActionState`, because there is nothing to type: the
 * status is a select and the optional amount is one field. A failure leaves the row as it
 * was, which is the honest render — the alternative is an error string in the URL that a
 * reload would re-show long after the write is over.
 */
export async function setMilestoneStatusAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const milestoneId = (form.get("milestoneId") ?? "").toString();
  const status = (form.get("status") ?? "").toString();
  if (!tripId || !milestoneId || !isMilestoneStatus(status)) return;

  const rawPaid = (form.get("paidAmount") ?? "").toString().trim();
  const paidCents = rawPaid === "" ? undefined : dollarsToCents(rawPaid);

  const call = await callAgentFunction("agent-trip", {
    op: "payment_paid",
    tripId,
    milestoneId,
    status,
    // `null` from `dollarsToCents` means it was not a number. Sending nothing is right:
    // the function then records the full amount, which is what the field being blank
    // means anyway, rather than failing a write over a stray character.
    paidCents: paidCents === null ? undefined : paidCents,
  });

  if (call.ok) revalidateTrip(tripId);
  redirect(schedulePath(tripId));
}

/** Remove a payment. A hard delete — `payment_milestone` is not on §20.1's list. */
export async function deleteMilestoneAction(form: FormData): Promise<void> {
  const tripId = (form.get("tripId") ?? "").toString();
  const milestoneId = (form.get("milestoneId") ?? "").toString();
  if (!tripId || !milestoneId) return;

  const call = await callAgentFunction("agent-trip", {
    op: "payment_delete",
    tripId,
    milestoneId,
  });

  if (call.ok) revalidateTrip(tripId);
  redirect(schedulePath(tripId));
}
