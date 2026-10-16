"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { PAYMENTS_COPY, SCHEDULE_COPY } from "@/lib/agent/content";
import {
  dollarsToCents,
  isMilestoneStatus,
  markPaidFromFormData,
  milestoneFromFormData,
  validateMarkPaid,
  validateMilestone,
  validatePayLink,
  type MarkPaidState,
  type PayLinkState,
  type ScheduleState,
} from "@/lib/agent/payments";
import { agentIdentity, localDate } from "@/lib/agent/queries";

/**
 * §3.4.15's three writes.
 *
 * TWO OF THEM LOOK ALIKE AND ARE NOT. `saveMilestoneAction` changes what the supplier
 * expects; `setMilestoneStatusAction` changes whether the money moved. Only the second can
 * reach `trip.total_paid_cents`, which since 20260929100000 is a trigger-maintained sum and
 * is the "paid so far" both the traveler and the advisor read. Keeping them apart at every
 * layer — SQL, route, action, form — is what makes a label edit incapable of moving that
 * number.
 *
 * §3.6 (2026-10-16) adds two more: `setPayLinkAction` (the pay link, audited in SQL) and
 * `markPaidAction` (Mark Paid with a date, confirmation number and note).
 */

function schedulePath(tripId: string): string {
  return `/agent/trips/${tripId}/payments`;
}

function revalidateTrip(tripId: string): void {
  revalidatePath(schedulePath(tripId));
  revalidatePath(`${schedulePath(tripId)}/history`);
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

/**
 * §3.6.1b: add, change or remove a milestone's pay link (Data-Model §9.5).
 *
 * Checked here first (https only, at most 2,048 characters, never a card number), then by
 * `agent-trip`'s `payment_link` op with `new URL()`, then by the column's CHECK. A blank
 * field removes the link. The SQL function writes the audit row (link_set / link_changed /
 * link_removed) in the same transaction, and a no-op writes nothing.
 */
export async function setPayLinkAction(_prev: PayLinkState, form: FormData): Promise<PayLinkState> {
  const tripId = (form.get("tripId") ?? "").toString();
  const milestoneId = (form.get("milestoneId") ?? "").toString();
  const remove = form.get("intent") === "remove";
  const raw = remove ? "" : (form.get("payUrl") ?? "").toString();
  if (!tripId || !milestoneId) return { error: PAYMENTS_COPY.failed, value: raw };

  const checked = validatePayLink(raw);
  if (!checked.ok) return { error: checked.error, value: raw };

  const call = await callAgentFunction("agent-trip", {
    op: "payment_link",
    tripId,
    milestoneId,
    payUrl: checked.url,
  });
  if (!call.ok) {
    return {
      error: call.kind === "rejected" ? (call.detail ?? PAYMENTS_COPY.failed) : PAYMENTS_COPY.failed,
      value: raw,
    };
  }

  revalidateTrip(tripId);
  redirect(schedulePath(tripId));
}

/**
 * §3.6.5 Mark Paid: the amount, the date the money landed, and an optional confirmation
 * number and note. Through `payment_paid`, the same write §3.4.15's status control uses, so
 * it stays the only thing that can move `trip.total_paid_cents`. Only the advisor does this;
 * a client's "I've paid" is a message, never a write.
 */
export async function markPaidAction(_prev: MarkPaidState, form: FormData): Promise<MarkPaidState> {
  const tripId = (form.get("tripId") ?? "").toString();
  const milestoneId = (form.get("milestoneId") ?? "").toString();
  const values = markPaidFromFormData(form);
  if (!tripId || !milestoneId) return { formError: PAYMENTS_COPY.failed, values };

  const me = await agentIdentity();
  const today = localDate(new Date().toISOString(), me.timeZone) ?? new Date().toISOString().slice(0, 10);
  const fieldErrors = validateMarkPaid(values, today);
  if (fieldErrors) return { fieldErrors, values };

  const paidCents = values.amount === "" ? undefined : dollarsToCents(values.amount);

  const call = await callAgentFunction("agent-trip", {
    op: "payment_paid",
    tripId,
    milestoneId,
    status: "paid",
    paidCents: paidCents === null ? undefined : paidCents,
    paidOn: values.paidOn,
    // Blank clears a stored value on the SQL side; a typed value replaces it.
    paidReference: values.reference,
    paidNote: values.note,
  });

  if (!call.ok) {
    return {
      formError: call.kind === "rejected" ? (call.detail ?? PAYMENTS_COPY.failed) : PAYMENTS_COPY.failed,
      values,
    };
  }

  revalidateTrip(tripId);
  redirect(schedulePath(tripId));
}
