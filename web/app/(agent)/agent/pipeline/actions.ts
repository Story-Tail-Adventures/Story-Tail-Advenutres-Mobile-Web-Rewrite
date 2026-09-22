"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { AGENT_COPY } from "@/lib/agent/content";

export type StageChangeResult =
  | { ok: true }
  | { ok: false; message: string; stale?: boolean };

/**
 * Screen 3.2.2's one write.
 *
 * `expectedVersion` is REQUIRED and comes down with the board. `trip.version` has existed
 * since the initial migration and nothing had ever honoured it (Data-Model §20.4); two tabs
 * open on the same board is exactly what it is for. A mismatch comes back 409 — the agent
 * did nothing wrong, the row moved under them — and the remedy is a reload, which is what
 * the message says.
 *
 * The Edge Function is the only door: `agent_set_trip_status` is service_role-only precisely
 * so a browser cannot reach it and skip the `audit_event`.
 */
export async function changeTripStage(input: {
  tripId: string;
  status: string;
  expectedVersion: number;
  cancellationReason?: string;
}): Promise<StageChangeResult> {
  const result = await callAgentFunction("agent-trip-status", {
    tripId: input.tripId,
    status: input.status,
    expectedVersion: input.expectedVersion,
    ...(input.cancellationReason ? { cancellationReason: input.cancellationReason } : {}),
  });

  if (result.ok) {
    // Both surfaces read the same board, and the worklist's KPIs move with a stage change —
    // "booked this month" and the commission forecast are both derived from it.
    revalidatePath("/agent/pipeline");
    revalidatePath("/agent");
    return { ok: true };
  }

  // A 409 arrives as `rejected` with the function's own sentence. Prefer that sentence: it
  // is the one written next to the rule, and the generic copy is the fallback.
  if (result.kind === "rejected") {
    const stale = (result.detail ?? "").toLowerCase().includes("moved since");
    return { ok: false, message: result.detail ?? AGENT_COPY.stageFailed, stale };
  }

  return { ok: false, message: AGENT_COPY.stageFailed };
}
