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

  // A 409 arrives as `rejected`, and `conflict` IS the 409 — carried down from the one
  // place that holds the status code (lib/supabase/edge.ts) rather than recovered here.
  //
  // THE OLD TEST WAS `detail.toLowerCase().includes("moved since")`. Reword the sentence in
  // supabase/functions/agent-trip-status/index.ts — a copy edit, on the other stack, by
  // someone with no reason to look at this file — and optimistic-lock detection silently
  // stops working, with nothing in the type checker and nothing in the tests to notice. The
  // whole point of declaring the flag was to stop reading the server's English as an API.
  //
  // `detail` still carries the MESSAGE for every other rejection, because that sentence is
  // written next to the rule it enforces. On the stale branch StageMenu prefers
  // `AGENT_COPY.stageStale` instead; its comment says why.
  if (result.kind === "rejected") {
    return {
      ok: false,
      message: result.detail ?? AGENT_COPY.stageFailed,
      stale: result.conflict === true,
    };
  }

  return { ok: false, message: AGENT_COPY.stageFailed };
}
