"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelTripAction } from "@/app/(agent)/agent/trips/[tripId]/actions";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY } from "@/lib/agent/content";
import { cancelImpact, REFUND_STATUS_OPTIONS } from "@/lib/agent/cancelTrip";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";

/**
 * Screen 3.4.16 — Cancel / Archive Trip.
 *
 * §4.4 Pattern J on the native `<dialog>` with `showModal()`, the same primitive
 * `ClientArchiveDialog` and `FilterSheet` use: focus trapping, Escape-to-dismiss and an
 * inert background come free, and a hand-rolled overlay has to be told about all three.
 *
 * IT IS ALSO THE EDIT DIALOG. A refund that is `pending` on the day a trip is cancelled
 * becomes `full` or `partial` weeks later, so a write-once cancellation would rot in
 * exactly the way `trip.refund_status` already had. `agent_set_trip_status` answers
 * `reason_changed` for a same-stage edit and writes no history row, so re-opening this on
 * a trip that is already cancelled is a correction rather than a second cancellation.
 *
 * `btn-danger`, where `ClientArchiveDialog` deliberately is not. Its rule — "red is for
 * things that do not come back" — is about the ROW, and by that test cancelling is
 * reversible: the stage can be moved back and this migration keeps the refund history when
 * it is. But the act the button stands for is a phone call to a client and a supplier, and
 * that does not come back. The copy carries the same split: this marks the trip cancelled,
 * and does not contact anybody.
 */
export function CancelTripDialog({ overview }: { overview: TripDetailOverview }) {
  const ref = useRef<HTMLDialogElement>(null);
  const alreadyCancelled = overview.status === "cancelled";

  const [reason, setReason] = useState(overview.cancellationReason ?? "");
  const [refundStatus, setRefundStatus] = useState(overview.refundStatus ?? "");
  const [refundDetail, setRefundDetail] = useState(overview.refundDetail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const impact = cancelImpact(overview);
  const canSubmit = reason.trim() !== "" && !pending;

  function open() {
    setError(null);
    setReason(overview.cancellationReason ?? "");
    setRefundStatus(overview.refundStatus ?? "");
    setRefundDetail(overview.refundDetail ?? "");
    ref.current?.showModal();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTripAction({
        tripId: overview.tripId,
        expectedVersion: overview.version,
        reason: reason.trim(),
        refundStatus: refundStatus || undefined,
        refundDetail: refundDetail.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      ref.current?.close();
      // `revalidatePath` refreshes the server data; this repaints the page already on
      // screen so the header's own chip follows the write without a reload.
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-outlined btn-sm" onClick={open}>
        {alreadyCancelled ? AGENT_COPY.cancelSaveDetails : AGENT_COPY.cancelTripOpen}
        <span className="sr-only"> — {overview.title}</span>
      </button>

      <dialog
        ref={ref}
        className="card m-auto w-[min(560px,calc(100vw-2rem))] p-5 backdrop:bg-black/45"
        aria-label={alreadyCancelled ? AGENT_COPY.cancelSaveDetails : AGENT_COPY.cancelTripOpen}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--md-error-container)] text-[var(--md-on-error-container)]">
            <Icon name="warning" size={18} />
          </span>
          <div className="min-w-0">
            <span className="t-label-s block text-[var(--md-error)]">
              {alreadyCancelled ? AGENT_COPY.cancelTripEditEyebrow : AGENT_COPY.cancelTripEyebrow}
            </span>
            <h2 className="t-title-l m-0 break-words">{overview.title}</h2>
          </div>
        </div>

        <p className="t-body mt-2 text-[var(--md-on-surface-variant)]">
          {alreadyCancelled ? AGENT_COPY.cancelTripEditBody : AGENT_COPY.cancelTripBody}
        </p>

        {/* Derived from this trip, never hardcoded — see `cancelImpact`. Suppressed once the
            trip is already cancelled, where every line is in the past tense and misleading. */}
        {!alreadyCancelled && (
          <div className="card mt-3 bg-[var(--md-surface-2)] p-3">
            <div className="t-label text-[var(--md-on-surface-variant)]">
              {AGENT_COPY.cancelImpactTitle}
            </div>
            {impact.length === 0 ? (
              <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
                {AGENT_COPY.cancelImpactNone}
              </p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {impact.map((line) => (
                  <li
                    key={line.text}
                    className={`t-body-s ${
                      line.tone === "warn"
                        ? "text-[var(--md-on-surface)]"
                        : "text-[var(--md-on-surface-variant)]"
                    }`}
                  >
                    {line.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3">
          <label htmlFor="cancel-reason" className="field-label">
            {AGENT_COPY.cancelReasonLabel}
          </label>
          <textarea
            id="cancel-reason"
            className="input h-16 resize-none p-3"
            placeholder={AGENT_COPY.cancelReasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            required
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cancel-refund" className="field-label">
              {AGENT_COPY.cancelRefundLabel}
            </label>
            <select
              id="cancel-refund"
              className="input"
              value={refundStatus}
              onChange={(e) => setRefundStatus(e.target.value)}
              disabled={pending}
            >
              {/* "" is NOT a fifth status. The column is nullable and null means "not
                  stated", which is a different fact from `none_expected` — one is an
                  advisor who has not checked, the other is one who has. */}
              <option value="">{AGENT_COPY.cancelRefundUnset}</option>
              {REFUND_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cancel-refund-detail" className="field-label">
              {AGENT_COPY.cancelRefundDetailLabel}
            </label>
            <input
              id="cancel-refund-detail"
              className="input"
              placeholder={AGENT_COPY.cancelRefundDetailPlaceholder}
              value={refundDetail}
              onChange={(e) => setRefundDetail(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <p className="t-body-s mt-1 text-[var(--md-on-surface-variant)]">
          {AGENT_COPY.cancelRefundDetailHelp}
        </p>

        {/* A courtesy, not the enforcement: the Edge Function refuses a reasonless
            cancellation regardless, and one rule in two places is one rule that drifts. */}
        {reason.trim() === "" && (
          <p className="t-body-s mt-2 text-[var(--md-on-surface-variant)]">
            {AGENT_COPY.cancelReasonRequired}
          </p>
        )}

        {error && (
          <p className="t-body-s mt-2 text-[var(--md-error)]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outlined btn-sm"
            disabled={pending}
            onClick={() => ref.current?.close()}
          >
            {AGENT_COPY.cancelKeep}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm ml-auto"
            disabled={!canSubmit}
            onClick={submit}
          >
            {pending
              ? AGENT_COPY.cancelSaving
              : alreadyCancelled
                ? AGENT_COPY.cancelSaveDetails
                : AGENT_COPY.cancelConfirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
