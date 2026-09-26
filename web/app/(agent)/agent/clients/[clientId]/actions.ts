"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { CLIENT_COPY } from "@/lib/agent/content";

export type NoteWriteResult =
  | { ok: true; noteId: string }
  | { ok: false; message: string };

/**
 * Screen 3.3.7's add / edit / delete.
 *
 * ONE ACTION, THREE OPS, matching `agent_write_client_note`'s own shape. Three actions
 * would be three copies of the same transport call, the same revalidate and the same error
 * mapping, differing only in a string.
 *
 * NO `expectedVersion`. `client_note` has no `version` column — Data-Model §20.4 lists the
 * tables that do — and the write migration's header argues why adding one is a Data-Model
 * change rather than this change's business. So unlike `updateTripNotes` there is no 409
 * arm here; a `conflict` from the transport would mean something unexpected, and it falls
 * through to the generic failure rather than claiming a staleness the schema cannot detect.
 *
 * DELETE IS AN ARCHIVE. `client_note.archived_at`, per Data-Model §20.1's soft-delete set —
 * a note the agent removes leaves the tab but not the record.
 */
export async function writeClientNote(input: {
  clientId: string;
  op: "create" | "update" | "archive";
  noteId?: string;
  body?: string;
}): Promise<NoteWriteResult> {
  if (input.op !== "archive" && (input.body ?? "").trim() === "") {
    return { ok: false, message: CLIENT_COPY.noteEmptyRefused };
  }

  const result = await callAgentFunction("agent-client-notes", {
    clientId: input.clientId,
    op: input.op,
    ...(input.noteId ? { noteId: input.noteId } : {}),
    ...(input.op === "archive" ? {} : { body: input.body }),
  });

  if (result.ok) {
    revalidatePath(`/agent/clients/${input.clientId}`);
    const noteId = result.data.noteId;
    return { ok: true, noteId: typeof noteId === "string" ? noteId : "" };
  }

  if (result.kind === "rejected") {
    return { ok: false, message: result.detail ?? CLIENT_COPY.noteFailed };
  }

  return { ok: false, message: CLIENT_COPY.noteFailed };
}
