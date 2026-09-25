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
