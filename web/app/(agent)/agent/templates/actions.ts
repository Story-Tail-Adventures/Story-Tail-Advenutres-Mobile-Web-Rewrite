"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { TEMPLATE_COPY } from "@/lib/agent/content";

export type TemplateResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

/**
 * §3.4.13's writes, all four through the one door.
 *
 * NONE OF THESE TAKE AN `expectedVersion`. `trip_template` has no `version` column, and it
 * does not want one: the payload is not editable (see the RPC), so the only concurrent edit
 * possible is two tabs renaming the same pattern, where last-write-wins is the honest
 * answer. Optimistic locking exists on `trip` because two advisors can move money on it.
 */
export async function saveAsTemplateAction(input: {
  tripId: string;
  name: string;
  description?: string;
}): Promise<TemplateResult> {
  const result = await callAgentFunction("agent-template", {
    op: "save",
    tripId: input.tripId,
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  });

  if (result.ok) {
    revalidatePath("/agent/templates");
    const components = Number(result.data.componentsSaved ?? 0);
    const days = Number(result.data.daysSaved ?? 0);
    return { ok: true, message: TEMPLATE_COPY.savedReceipt(components, days) };
  }

  return {
    ok: false,
    message: (result.kind === "rejected" && result.detail) || TEMPLATE_COPY.saveFailed,
  };
}

export async function renameTemplateAction(input: {
  templateId: string;
  name: string;
  description?: string;
}): Promise<TemplateResult> {
  const result = await callAgentFunction("agent-template", {
    op: "update",
    templateId: input.templateId,
    name: input.name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  });

  if (result.ok) {
    revalidatePath("/agent/templates");
    return { ok: true };
  }
  return {
    ok: false,
    message: (result.kind === "rejected" && result.detail) || TEMPLATE_COPY.saveFailed,
  };
}

export async function archiveTemplateAction(input: {
  templateId: string;
}): Promise<TemplateResult> {
  const result = await callAgentFunction("agent-template", {
    op: "archive",
    templateId: input.templateId,
  });

  if (result.ok) {
    revalidatePath("/agent/templates");
    return { ok: true };
  }
  return {
    ok: false,
    message: (result.kind === "rejected" && result.detail) || TEMPLATE_COPY.archiveFailed,
  };
}

/**
 * Apply a pattern to a trip.
 *
 * `already_applied` IS A SUCCESS. The RPC is idempotent on `trip.template_id` and answers
 * 200, so a double-click, a retried request or a second tab all land here with nothing
 * written. Treating it as a failure would tell an advisor something went wrong when the
 * only thing that happened is that it already worked.
 */
export async function applyTemplateAction(input: {
  templateId: string;
  tripId: string;
}): Promise<TemplateResult> {
  const result = await callAgentFunction("agent-template", {
    op: "apply",
    templateId: input.templateId,
    tripId: input.tripId,
  });

  if (result.ok) {
    // Everything the pattern touched, plus the surfaces that count and total it.
    revalidatePath(`/agent/trips/${input.tripId}`);
    revalidatePath(`/agent/trips/${input.tripId}/builder`);
    revalidatePath(`/agent/trips/${input.tripId}/itinerary`);
    revalidatePath("/agent/templates");
    revalidatePath("/agent/trips");
    revalidatePath("/agent");

    if (result.data.outcome === "already_applied") {
      return { ok: true, message: TEMPLATE_COPY.alreadyApplied };
    }
    return {
      ok: true,
      message: TEMPLATE_COPY.appliedReceipt(
        Number(result.data.componentsAdded ?? 0),
        Number(result.data.daysAdded ?? 0),
      ),
    };
  }

  return {
    ok: false,
    message: (result.kind === "rejected" && result.detail) || TEMPLATE_COPY.applyFailed,
  };
}
