"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { ACCOUNT_ADMIN_COPY, MERGE_COPY } from "@/lib/agent/content";
import { isUuid } from "@/lib/agent/messageQuery";

export type MergeResult =
  | { ok: true; keptClientId: string }
  | { ok: false; message: string; stale?: boolean };

/**
 * §3.9.7 / §3.3.11's write, the `merge` op on `account-admin`. Every rule (fresh MFA, ownership,
 * versions, the defaults, the sign-in plan) is the Edge Function's and the SQL's; this sends what
 * the advisor flipped and turns the outcome into a sentence.
 */
export async function mergeClientsAction(input: {
  keepId: string;
  otherId: string;
  keepVersion: number;
  otherVersion: number;
  choices: Record<string, "keep" | "retire">;
}): Promise<MergeResult> {
  // A server action is a public POST: check the shape here too, before it reaches the function.
  const choicesOk = Object.entries(input.choices ?? {}).every(
    ([k, v]) => /^[a-z_]{1,40}$/.test(k) && (v === "keep" || v === "retire"),
  );
  if (
    !isUuid(input.keepId) || !isUuid(input.otherId) || !choicesOk
    || !Number.isInteger(input.keepVersion) || !Number.isInteger(input.otherVersion)
  ) {
    return { ok: false, message: MERGE_COPY.failed };
  }

  const result = await callAgentFunction("account-admin", {
    op: "merge",
    clientId: input.keepId,
    otherClientId: input.otherId,
    keepVersion: input.keepVersion,
    otherVersion: input.otherVersion,
    choices: input.choices,
  });

  if (!result.ok) {
    if (result.kind === "rejected" && result.detail) {
      // The fresh-MFA refusal is technical, so it gets the tab's plain version.
      return {
        ok: false,
        message: /MFA was verified|requires multi-factor|Could not determine when MFA/.test(result.detail)
          ? ACCOUNT_ADMIN_COPY.mfaStale
          : result.detail,
      };
    }
    return { ok: false, message: MERGE_COPY.failed };
  }

  switch (result.data.outcome) {
    case "merged":
      revalidatePath(`/agent/clients/${input.keepId}`);
      revalidatePath(`/agent/clients/${input.otherId}`);
      revalidatePath("/agent/clients");
      return { ok: true, keptClientId: input.keepId };
    case "stale":
      return { ok: false, message: MERGE_COPY.stale, stale: true };
    case "refused":
      return {
        ok: false,
        message: typeof result.data.reason === "string" ? result.data.reason : MERGE_COPY.failed,
      };
    default:
      return { ok: false, message: MERGE_COPY.failed };
  }
}
