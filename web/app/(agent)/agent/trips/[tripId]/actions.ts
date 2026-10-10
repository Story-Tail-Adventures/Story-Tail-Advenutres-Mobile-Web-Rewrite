"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { AGENT_COPY } from "@/lib/agent/content";

export type NotesSaveResult =
  | { ok: true; version: number }
  | { ok: false; message: string; stale?: boolean };

/**
 * Screen 3.4.2's Notes tab write. Same shape as `changeTripStage` in
 * `app/(agent)/agent/pipeline/actions.ts` — a 409 is `stale`, read off the transport's typed
 * `conflict` flag rather than a substring of the Edge Function's sentence.
 *
 * RETURNS THE SERVER'S VERSION, NOT `expectedVersion + 1`. `agent_set_trip_notes` only bumps
 * `trip.version` on a real change — a `noop` write (the submitted text matched what was
 * already stored) leaves the row's version untouched. A caller that assumed every 200 means
 * "+1" would go stale against its own no-op save on the very next edit, which is exactly the
 * bug this field exists to prevent the editor from reintroducing.
 */
export async function updateTripNotes(input: {
  tripId: string;
  notes: string;
  expectedVersion: number;
}): Promise<NotesSaveResult> {
  const result = await callAgentFunction("agent-trip-notes", {
    tripId: input.tripId,
    notes: input.notes,
    expectedVersion: input.expectedVersion,
  });

  if (result.ok) {
    revalidatePath(`/agent/trips/${input.tripId}`);
    const version = result.data.version;
    return { ok: true, version: typeof version === "number" ? version : input.expectedVersion };
  }

  if (result.kind === "rejected") {
    return {
      ok: false,
      message: result.conflict ? AGENT_COPY.notesStale : (result.detail ?? AGENT_COPY.notesFailed),
      stale: result.conflict === true,
    };
  }

  return { ok: false, message: AGENT_COPY.notesFailed };
}

export type CancelTripResult =
  | { ok: true }
  | { ok: false; message: string; stale?: boolean };

/**
 * Screen 3.4.16 — cancel a trip, and correct a cancellation afterwards.
 *
 * ONE ACTION FOR BOTH, because the layer below already is one. `agent_set_trip_status`
 * answers `changed` for the transition and `reason_changed` for a same-stage edit of the
 * reason, the refund status or the refund detail, and the Edge Function audits them under
 * different event types. Splitting this into two actions would put a fork here that the
 * RPC has to make anyway, and the caller has nothing to do differently with the answer.
 *
 * The reason is NOT validated here. The Edge Function refuses a cancellation without one —
 * `trip.cancellation_reason` is inside the client column grant and §2.2.10 renders it — and
 * a second copy of that rule in the browser is a second place for it to drift. The dialog
 * disables its own button, which is a courtesy, not the enforcement.
 */
export async function cancelTripAction(input: {
  tripId: string;
  expectedVersion: number;
  reason: string;
  refundStatus?: string;
  refundDetail?: string;
}): Promise<CancelTripResult> {
  const result = await callAgentFunction("agent-trip-status", {
    tripId: input.tripId,
    status: "cancelled",
    expectedVersion: input.expectedVersion,
    cancellationReason: input.reason,
    // Omitted rather than sent as null: the RPC parameters carry SQL DEFAULTs, and the
    // function coalesces against the stored value so an omitted field is "leave it alone"
    // rather than "clear it". Sending null would wipe a refund detail on any later edit
    // that did not happen to retype it.
    ...(input.refundStatus ? { refundStatus: input.refundStatus } : {}),
    ...(input.refundDetail?.trim() ? { refundDetail: input.refundDetail.trim() } : {}),
  });

  if (result.ok) {
    revalidatePath(`/agent/trips/${input.tripId}`);
    // The roster and the board both count by stage, and the dashboard's commission figure
    // sums open trips — all three are wrong the moment this returns until they re-read.
    revalidatePath("/agent/trips");
    revalidatePath("/agent/pipeline");
    revalidatePath("/agent");
    return { ok: true };
  }

  if (result.kind === "rejected") {
    return {
      ok: false,
      message: result.conflict
        ? AGENT_COPY.cancelStale
        : (result.detail ?? AGENT_COPY.cancelFailed),
      stale: result.conflict === true,
    };
  }

  return { ok: false, message: AGENT_COPY.cancelFailed };
}
