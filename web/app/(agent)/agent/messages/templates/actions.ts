"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { MESSAGE_TEMPLATE_COPY } from "@/lib/agent/content";

/**
 * §3.10 Stage 2's writes, through `agent-message-template`. Each answers a plain result the
 * calling component shows; nothing here redirects, so a refused save keeps every word typed.
 *
 * Every write revalidates the whole /agent/messages tree: the library, the editor, and every
 * thread's picker read the same rows. No caller adds a `router.refresh()` on top.
 */

function revalidateTemplates(): void {
  revalidatePath("/agent/messages", "layout");
}

export type TemplateWriteResult =
  | { ok: true; templateId: string; changed: boolean }
  | { ok: false; message: string };

function failure(result: { ok: false; kind: string; detail?: string }, fallback: string): { ok: false; message: string } {
  return { ok: false, message: result.kind === "rejected" ? (result.detail ?? fallback) : fallback };
}

/**
 * Create (with the id the editor minted once per form, so a double click lands once) or save
 * an edit. `changed` is false for a Save that matched what was stored.
 */
export async function saveMessageTemplateAction(input: {
  mode: "create" | "update";
  templateId: string;
  category: string;
  name: string;
  body: string;
  tags: string[];
}): Promise<TemplateWriteResult> {
  const result = await callAgentFunction("agent-message-template", {
    op: input.mode,
    templateId: input.templateId,
    category: input.category,
    name: input.name,
    body: input.body,
    tags: input.tags,
  });
  if (!result.ok) return failure(result, MESSAGE_TEMPLATE_COPY.saveFailed);
  revalidateTemplates();
  const outcome = result.data.outcome;
  return { ok: true, templateId: input.templateId, changed: outcome === "created" || outcome === "changed" };
}

export async function duplicateMessageTemplateAction(input: {
  templateId: string;
  newTemplateId: string;
}): Promise<TemplateWriteResult> {
  const result = await callAgentFunction("agent-message-template", {
    op: "duplicate",
    templateId: input.templateId,
    newTemplateId: input.newTemplateId,
  });
  if (!result.ok) return failure(result, MESSAGE_TEMPLATE_COPY.actionFailed);
  revalidateTemplates();
  return { ok: true, templateId: input.newTemplateId, changed: result.data.outcome === "created" };
}

export async function setMessageTemplateArchivedAction(input: {
  templateId: string;
  archived: boolean;
}): Promise<TemplateWriteResult> {
  const result = await callAgentFunction("agent-message-template", {
    op: "archive",
    templateId: input.templateId,
    archived: input.archived,
  });
  if (!result.ok) return failure(result, MESSAGE_TEMPLATE_COPY.actionFailed);
  revalidateTemplates();
  return { ok: true, templateId: input.templateId, changed: result.data.outcome === "changed" };
}
