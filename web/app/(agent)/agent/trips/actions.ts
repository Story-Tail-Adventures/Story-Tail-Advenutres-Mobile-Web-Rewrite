"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { bulkStatusResult, TRIP_COPY } from "@/lib/agent/content";
import { TRIP_STATUS_FILTERS, type TripStatusFilter } from "@/lib/agent/tripStatuses";

/**
 * Screen 3.4.1's bulk stage change.
 *
 * THE SELECTION IS FORM DATA, NOT REACT STATE — the same trade §3.3.1's bulk-tag bar makes,
 * and for the same three reasons: the browser holds the selection, the roster stays a server
 * component, and the bar works before hydration and with JavaScript off.
 *
 * WHAT IS DIFFERENT HERE IS THE GUARD. Each ticked row posts `tripId:fromStatus`, not just
 * an id, because setting a stage OVERWRITES where adding a tag cannot. A trip somebody else
 * moved while this page sat open is skipped rather than clobbered. Packing the pair into one
 * field value keeps them zipped by construction — two parallel `getAll` arrays could drift
 * if a checkbox were ever rendered without its partner.
 */

export type BulkStatusState = { message?: string; error?: string };

const VALID = new Set<string>(TRIP_STATUS_FILTERS.map((f) => f.value));

export async function bulkSetTripStatusAction(
  _prev: BulkStatusState,
  form: FormData,
): Promise<BulkStatusState> {
  const picked = form.getAll("trip").map((v) => v.toString()).filter(Boolean);
  const toStatus = (form.get("toStatus") ?? "").toString();

  if (picked.length === 0) return { error: TRIP_COPY.bulkNoSelection };
  if (!VALID.has(toStatus)) return { error: TRIP_COPY.bulkNoStatus };
  // Refused before the round trip as well as in SQL and in the Edge Function. The bar does
  // not offer it, so reaching this means something else called the action.
  if (toStatus === "cancelled") return { error: TRIP_COPY.bulkCancelRefused };

  const trips: { tripId: string; fromStatus: string }[] = [];
  for (const entry of picked) {
    const [tripId, fromStatus] = entry.split(":");
    if (!tripId || !fromStatus || !VALID.has(fromStatus)) {
      return { error: TRIP_COPY.bulkFailed };
    }
    trips.push({ tripId, fromStatus });
  }

  const call = await callAgentFunction("agent-trip-status", {
    op: "bulk",
    trips,
    status: toStatus,
  });

  if (!call.ok) {
    return {
      error: call.kind === "rejected"
        ? (call.detail ?? TRIP_COPY.bulkFailed)
        : TRIP_COPY.bulkFailed,
    };
  }

  const moved = typeof call.data.movedCount === "number" ? call.data.movedCount : 0;
  const requested = typeof call.data.requestedCount === "number"
    ? call.data.requestedCount
    : trips.length;

  const label = TRIP_STATUS_FILTERS.find((f) => f.value === toStatus)?.label ?? toStatus;

  revalidatePath("/agent/trips");
  // The board and the worklist read the same trips, so a stage moved here must not leave
  // either showing the old column.
  revalidatePath("/agent/pipeline");
  revalidatePath("/agent");

  return { message: bulkStatusResult(label, moved, requested) };
}

export type { TripStatusFilter };
