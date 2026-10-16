"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { ACCOUNT_ADMIN_COPY, CLIENT_COPY } from "@/lib/agent/content";

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

export type AccountAdminOp =
  | "reset"
  | "magic_link"
  | "invite"
  | "verify_email"
  | "lock"
  | "unlock"
  | "sign_out_everywhere"
  | "flag"
  | "unflag";

export type AccountAdminResult =
  | { ok: true; message: string }
  | { ok: false; message: string; duplicateClientId?: string | null };

/**
 * §3.9's one door to `account-admin`. Every decision (MFA, ownership, eligibility, the cap) is
 * the Edge Function's; this only turns its outcome into a sentence and refreshes the tab.
 *
 * The function never returns a sign-in link, so there is nothing here to keep out of the page.
 */
export async function accountAdminAction(input: {
  clientId: string;
  op: AccountAdminOp;
  /** For the sent message: the address the email went to. Display only. */
  email?: string;
  reason?: string;
  note?: string;
  authEventId?: string;
}): Promise<AccountAdminResult> {
  const result = await callAgentFunction("account-admin", {
    clientId: input.clientId,
    op: input.op,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.authEventId ? { authEventId: input.authEventId } : {}),
  });

  revalidatePath(`/agent/clients/${input.clientId}`);

  if (!result.ok) {
    if (result.kind === "rejected" && result.detail) {
      // A 4xx's detail is written for this screen (the MFA gate, a short note, a missing
      // reason). A fresh-MFA refusal is technical, so it gets the plain version.
      return {
        ok: false,
        message: /MFA was verified|requires multi-factor|Could not determine when MFA/.test(result.detail)
          ? ACCOUNT_ADMIN_COPY.mfaStale
          : result.detail,
      };
    }
    return { ok: false, message: ACCOUNT_ADMIN_COPY.failed };
  }

  const outcome = result.data.outcome;
  switch (outcome) {
    case "sent":
      return { ok: true, message: ACCOUNT_ADMIN_COPY.sent(input.email ?? "their email") };
    case "capped":
      return { ok: false, message: ACCOUNT_ADMIN_COPY.capped };
    case "failed":
      return { ok: false, message: ACCOUNT_ADMIN_COPY.sendFailed };
    case "refused":
      return {
        ok: false,
        message: typeof result.data.reason === "string" ? result.data.reason : ACCOUNT_ADMIN_COPY.failed,
      };
    case "duplicate":
      return {
        ok: false,
        message: ACCOUNT_ADMIN_COPY.duplicate,
        duplicateClientId:
          typeof result.data.duplicateClientId === "string" ? result.data.duplicateClientId : null,
      };
    case "noop":
      return { ok: true, message: ACCOUNT_ADMIN_COPY.noop };
    case "changed":
      return { ok: true, message: ACCOUNT_ADMIN_COPY.changed };
    default:
      return { ok: false, message: ACCOUNT_ADMIN_COPY.failed };
  }
}
