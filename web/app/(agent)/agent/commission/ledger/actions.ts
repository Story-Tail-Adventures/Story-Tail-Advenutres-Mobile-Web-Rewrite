"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import {
  lineValuesFromForm,
  parseLagDays,
  parseRate,
  paymentValuesFromForm,
  validateLine,
  validatePayment,
  type LineFormState,
  type LineValues,
  type PaymentFormState,
} from "@/lib/agent/commissionForm";
import { COMMISSION_COPY } from "@/lib/agent/content";
import { dollarsToCents } from "@/lib/agent/payments";

/**
 * §3.7.3 / §3.7.4's writes, through the `agent-commission` Edge Function.
 *
 * TWO KINDS OF WRITE, KEPT APART: `createLineAction` / `updateLineAction` say what was booked
 * and what is owed; `recordPaymentAction` says what arrived. Only the last reaches `received`
 * or `disputed` — the same separation the SQL, the route and the forms keep.
 *
 * STALENESS IS READ OFF `conflict`, never off the English sentence the function wrote — the
 * rule `lib/supabase/edge.ts` records after `changeTripStage` once did the opposite.
 */

function linePath(commissionId: string): string {
  return `/agent/commission/ledger/${commissionId}`;
}

/** Every surface a commission write moves: both §3.7 views, the line, and the trip's card. */
function revalidateCommission(commissionId: string | null, tripId: string | null): void {
  revalidatePath("/agent/commission");
  revalidatePath("/agent/commission/ledger");
  if (commissionId) revalidatePath(linePath(commissionId));
  if (tripId) revalidatePath(`/agent/trips/${tripId}`);
}

/** The line fields as the Edge Function takes them. Only called after `validateLine`. */
function lineBody(values: LineValues) {
  return {
    supplierId: values.supplierId,
    grossCents: dollarsToCents(values.gross) ?? 0,
    commissionPct: parseRate(values.rate) ?? 0,
    paymentTerms: values.paymentTerms,
    paymentLagDays: parseLagDays(values.paymentLagDays) ?? 0,
    inteletravelReference: values.inteletravelReference,
    notes: values.notes,
  };
}

/** Signed out mid-form: back through sign-in to the page the advisor was on. */
function toSignIn(path: string): never {
  redirect(`/login?next=${encodeURIComponent(path)}`);
}

/** A 200 outcome that belongs against a field rather than at the top of the form. */
function outcomeErrors(outcome: unknown): LineFormState["fieldErrors"] | null {
  if (outcome === "duplicate_reference") return { inteletravelReference: COMMISSION_COPY.duplicateReference };
  if (outcome === "supplier_not_found") return { supplierId: COMMISSION_COPY.supplierGone };
  return null;
}

/** 3.7.4. On success the advisor lands on the new line. */
export async function createLineAction(_prev: LineFormState, form: FormData): Promise<LineFormState> {
  const tripId = (form.get("tripId") ?? "").toString();
  const values = lineValuesFromForm(form);
  if (!tripId) return { formError: COMMISSION_COPY.failed, values };

  const fieldErrors = validateLine(values);
  if (fieldErrors) return { fieldErrors, values };

  const call = await callAgentFunction("agent-commission", {
    op: "create",
    tripId,
    status: values.status || "expected",
    ...lineBody(values),
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(`/agent/commission/ledger/new?trip=${tripId}`);
    return {
      formError: call.kind === "rejected" ? (call.detail ?? COMMISSION_COPY.failed) : COMMISSION_COPY.failed,
      values,
    };
  }

  const outcomeFieldErrors = outcomeErrors(call.data.outcome);
  if (outcomeFieldErrors) return { fieldErrors: outcomeFieldErrors, values };

  const commissionId = String(call.data.commissionId ?? "");
  revalidateCommission(commissionId, tripId);
  redirect(commissionId ? linePath(commissionId) : "/agent/commission/ledger");
}

/** 3.7.3's edit. */
export async function updateLineAction(_prev: LineFormState, form: FormData): Promise<LineFormState> {
  const commissionId = (form.get("commissionId") ?? "").toString();
  const tripId = (form.get("tripId") ?? "").toString();
  const expectedVersion = Number.parseInt((form.get("version") ?? "").toString(), 10);
  const values = lineValuesFromForm(form);
  if (!commissionId || !Number.isFinite(expectedVersion)) return { formError: COMMISSION_COPY.failed, values };

  const fieldErrors = validateLine(values);
  if (fieldErrors) return { fieldErrors, values };

  const call = await callAgentFunction("agent-commission", {
    op: "update",
    commissionId,
    expectedVersion,
    status: values.status,
    // Only the required checkbox sends this. The server refuses to wipe a payment without it.
    clearPayment: form.get("clearPayment") === "true",
    ...lineBody(values),
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(linePath(commissionId));
    if (call.conflict) return { formError: COMMISSION_COPY.stale, values };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? COMMISSION_COPY.failed) : COMMISSION_COPY.failed,
      values,
    };
  }

  const outcomeFieldErrors = outcomeErrors(call.data.outcome);
  if (outcomeFieldErrors) return { fieldErrors: outcomeFieldErrors, values };
  if (call.data.outcome === "payment_would_clear") return { formError: COMMISSION_COPY.clearsPayment, values };

  // Changed or a no-op alike: reload the line, so the form holds the server's version.
  revalidateCommission(commissionId, tripId || null);
  redirect(linePath(commissionId));
}

/** 3.7.3's "Mark received" — the only door to received and disputed. */
export async function recordPaymentAction(
  _prev: PaymentFormState,
  form: FormData,
): Promise<PaymentFormState> {
  const commissionId = (form.get("commissionId") ?? "").toString();
  const tripId = (form.get("tripId") ?? "").toString();
  const expectedVersion = Number.parseInt((form.get("version") ?? "").toString(), 10);
  const values = paymentValuesFromForm(form);
  if (!commissionId || !Number.isFinite(expectedVersion)) return { formError: COMMISSION_COPY.failed, values };

  const fieldErrors = validatePayment(values);
  if (fieldErrors) return { fieldErrors, values };

  const call = await callAgentFunction("agent-commission", {
    op: "payment",
    commissionId,
    expectedVersion,
    status: values.status === "disputed" ? "disputed" : "received",
    receivedCents: dollarsToCents(values.received) ?? 0,
    feeCents: dollarsToCents(values.fee) ?? 0,
    receivedAt: values.receivedAt,
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") toSignIn(linePath(commissionId));
    if (call.conflict) return { formError: COMMISSION_COPY.stale, values };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? COMMISSION_COPY.failed) : COMMISSION_COPY.failed,
      values,
    };
  }
  if (call.data.outcome === "bad_date") {
    return { fieldErrors: { receivedAt: COMMISSION_COPY.badDate }, values };
  }

  revalidateCommission(commissionId, tripId || null);
  redirect(linePath(commissionId));
}

export type RemoveState = { formError?: string };

/**
 * Remove a line entered by mistake. Through `useActionState` so a refusal says so in the
 * dialog — the first version redirected back to the same page on `stale` or
 * `not_removable`, and the dialog closed over an unchanged line with no word of why.
 */
export async function removeLineAction(_prev: RemoveState, form: FormData): Promise<RemoveState> {
  const commissionId = (form.get("commissionId") ?? "").toString();
  const tripId = (form.get("tripId") ?? "").toString();
  const expectedVersion = Number.parseInt((form.get("version") ?? "").toString(), 10);
  if (!commissionId || !Number.isFinite(expectedVersion)) return { formError: COMMISSION_COPY.failed };

  const call = await callAgentFunction("agent-commission", {
    op: "remove",
    commissionId,
    expectedVersion,
  });

  if (!call.ok && call.kind === "unauthenticated") toSignIn(linePath(commissionId));
  if (call.ok && call.data.outcome === "removed") {
    revalidateCommission(commissionId, tripId || null);
    redirect("/agent/commission/ledger");
  }
  return { formError: call.ok || call.conflict ? COMMISSION_COPY.removeRefused : COMMISSION_COPY.failed };
}
