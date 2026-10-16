import { callAgentRead } from "@/lib/agent/api";
import { type AccountAdminRow, type AccountAdminView, toAccountAdminView } from "@/lib/agent/accountAdminView";

/**
 * §3.9's one read. Server only (it reads the session cookie); the shaping is in
 * `accountAdminView.ts` so client code never imports this file.
 */

export type AccountAdminLoad =
  | { ok: true; view: AccountAdminView }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadAccountAdmin(clientId: string): Promise<AccountAdminLoad> {
  const result = await callAgentRead<AccountAdminRow>("agent_client_account_admin", {
    p_client_id: clientId,
  });
  if (!result.ok) return { ok: false, reason: "unavailable" };
  // A scalar jsonb comes back as the object itself, not a one-row array.
  const raw = result.rows as unknown;
  const row = (Array.isArray(raw) ? raw[0] : raw) as AccountAdminRow | null | undefined;
  if (!row) return { ok: false, reason: "not-found" };
  return { ok: true, view: toAccountAdminView(row) };
}
