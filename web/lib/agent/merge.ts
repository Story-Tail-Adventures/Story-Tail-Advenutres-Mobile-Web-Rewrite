import { callAgentRead } from "@/lib/agent/api";
import { type MergeView, type MergeViewRow, toMergeView } from "@/lib/agent/mergeView";

/**
 * §3.9.7 / §3.3.11's one read. Server only (it reads the session cookie); the shaping is in
 * `mergeView.ts` so client code never imports this file.
 */

export type MergeLoad =
  | { ok: true; view: MergeView }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadMergeView(
  clientId: string,
  options: { otherId?: string | null; search?: string | null } = {},
): Promise<MergeLoad> {
  const result = await callAgentRead<MergeViewRow>("agent_client_merge_view", {
    p_client_id: clientId,
    p_other_id: options.otherId ?? null,
    p_search: options.search ?? null,
  });
  if (!result.ok) return { ok: false, reason: "unavailable" };
  // A scalar jsonb comes back as the object itself, not a one-row array.
  const raw = result.rows as unknown;
  const row = (Array.isArray(raw) ? raw[0] : raw) as MergeViewRow | null | undefined;
  if (!row) return { ok: false, reason: "not-found" };
  return { ok: true, view: toMergeView(row, Boolean(options.otherId)) };
}
