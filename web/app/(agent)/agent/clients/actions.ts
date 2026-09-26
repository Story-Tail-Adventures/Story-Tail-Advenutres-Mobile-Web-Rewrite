"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { bulkTagResult, CLIENT_COPY } from "@/lib/agent/content";
import {
  clientFormFromFormData,
  type ClientFormState,
} from "@/lib/agent/clientFormState";
import { flattenIssues } from "@/lib/validation/flatten";
import { CLIENT_FIELDS, clientSchema, toClientPayload } from "@/lib/validation/client";

/**
 * Screens 3.3.9, 3.3.10 and 3.3.12's writes.
 *
 * ONE MODULE, THREE ACTIONS, because all three are the same transport call with the same
 * error mapping and differ only in an op — and because a `"use server"` module's every
 * export is an action, so splitting them buys nothing but more files.
 *
 * STALENESS COMES OFF THE TYPED `conflict` FLAG, never a substring of the Edge Function's
 * sentence. `lib/supabase/edge.ts` is emphatic about this: reword the sentence and
 * substring-based detection silently stops working with nothing to notice it.
 *
 * A DUPLICATE IS NOT A REJECTION. The Edge Function answers it 200 with the existing
 * client's id so the form can offer a link to the record the advisor already has. See that
 * function's header for why a 4xx could not carry it.
 */

function parsed(form: FormData) {
  const values = clientFormFromFormData(form);
  return { values, result: clientSchema.safeParse(values) };
}

export async function createClientAction(
  _prev: ClientFormState,
  form: FormData,
): Promise<ClientFormState> {
  const { values, result } = parsed(form);
  if (!result.success) {
    return { fieldErrors: flattenIssues(result.error, CLIENT_FIELDS), values };
  }

  const call = await callAgentFunction("agent-client", {
    op: "create",
    client: toClientPayload(result.data),
  });

  if (!call.ok) {
    return {
      formError: call.kind === "rejected"
        ? (call.detail ?? CLIENT_COPY.saveFailed)
        : CLIENT_COPY.saveFailed,
      values,
    };
  }

  if (call.data.outcome === "duplicate_email") {
    return {
      fieldErrors: { email: [CLIENT_COPY.duplicateEmail] },
      duplicateClientId: typeof call.data.existingClientId === "string"
        ? call.data.existingClientId
        : undefined,
      values,
    };
  }

  const clientId = call.data.clientId;
  if (typeof clientId !== "string") return { formError: CLIENT_COPY.saveFailed, values };

  revalidatePath("/agent/clients");
  // `redirect` throws, so nothing after it runs and the action's return type is never
  // reached on success. Landing on the new client's own page is the point of creating one.
  redirect(`/agent/clients/${clientId}`);
}

export async function updateClientAction(
  _prev: ClientFormState,
  form: FormData,
): Promise<ClientFormState> {
  const clientId = (form.get("clientId") ?? "").toString();
  const expectedVersion = Number((form.get("expectedVersion") ?? "").toString());
  const { values, result } = parsed(form);

  if (!clientId || !Number.isInteger(expectedVersion)) {
    return { formError: CLIENT_COPY.saveFailed, values };
  }
  if (!result.success) {
    return { fieldErrors: flattenIssues(result.error, CLIENT_FIELDS), values };
  }

  const call = await callAgentFunction("agent-client", {
    op: "update",
    clientId,
    expectedVersion,
    client: toClientPayload(result.data),
  });

  if (!call.ok) {
    return {
      formError: call.conflict === true
        ? CLIENT_COPY.saveStale
        : call.kind === "rejected"
          ? (call.detail ?? CLIENT_COPY.saveFailed)
          : CLIENT_COPY.saveFailed,
      values,
    };
  }

  if (call.data.outcome === "duplicate_email") {
    return { fieldErrors: { email: [CLIENT_COPY.duplicateEmail] }, values };
  }

  revalidatePath(`/agent/clients/${clientId}`);
  revalidatePath("/agent/clients");
  redirect(`/agent/clients/${clientId}`);
}

export type ArchiveResult = { ok: true } | { ok: false; message: string };

/**
 * Screen 3.3.12, both halves. `archived` is the boolean the one SQL function takes — see
 * its header for why archive and restore are not two functions.
 */
export async function setClientArchivedAction(input: {
  clientId: string;
  expectedVersion: number;
  archived: boolean;
  reason?: string;
}): Promise<ArchiveResult> {
  const call = await callAgentFunction("agent-client", {
    op: "archive",
    clientId: input.clientId,
    expectedVersion: input.expectedVersion,
    archived: input.archived,
    ...(input.reason ? { reason: input.reason } : {}),
  });

  if (!call.ok) {
    return {
      ok: false,
      message: call.conflict === true
        ? CLIENT_COPY.saveStale
        : call.kind === "rejected"
          ? (call.detail ?? CLIENT_COPY.saveFailed)
          : CLIENT_COPY.saveFailed,
    };
  }

  revalidatePath(`/agent/clients/${input.clientId}`);
  revalidatePath("/agent/clients");
  return { ok: true };
}

export type BulkTagState = { message?: string; error?: string };

/**
 * Screen 3.3.1's bulk tag.
 *
 * THE SELECTION IS FORM DATA, NOT CLIENT STATE. Every ticked row posts its own `clientId`,
 * so the browser holds the selection and the roster stays a server component — the same
 * trade the filters and the paginator already make. It also means the bar works before
 * hydration and with JavaScript off entirely.
 *
 * WHICH BUTTON WAS PRESSED IS THE DIRECTION. Two submit buttons share the name `direction`,
 * and only the pressed one posts a value. A hidden field plus JavaScript to flip it would be
 * the same thing with a hydration requirement bolted on.
 *
 * NO REDIRECT, DELIBERATELY. `redirect` would discard the result sentence, and a `?tagged=4`
 * on the URL would re-announce a write that already happened every time the page reloaded.
 * `revalidatePath` refetches the roster so the new chips are there, and the message comes
 * back through `useActionState`.
 */
export async function bulkTagClientsAction(
  _prev: BulkTagState,
  form: FormData,
): Promise<BulkTagState> {
  const clientIds = form.getAll("clientId").map((v) => v.toString()).filter(Boolean);
  const tag = (form.get("tag") ?? "").toString().trim().toLowerCase();
  const add = (form.get("direction") ?? "add").toString() !== "remove";

  if (clientIds.length === 0) return { error: CLIENT_COPY.bulkNoSelection };
  if (tag === "") return { error: CLIENT_COPY.bulkNoTag };

  const call = await callAgentFunction("agent-client", {
    op: "bulk_tag",
    clientIds,
    tag,
    add,
  });

  if (!call.ok) {
    return {
      error: call.kind === "rejected" ? (call.detail ?? CLIENT_COPY.bulkFailed) : CLIENT_COPY.bulkFailed,
    };
  }

  const changed = typeof call.data.changedCount === "number" ? call.data.changedCount : 0;
  const requested = typeof call.data.requestedCount === "number"
    ? call.data.requestedCount
    : clientIds.length;

  revalidatePath("/agent/clients");
  return { message: bulkTagResult(tag, changed, requested, add) };
}
