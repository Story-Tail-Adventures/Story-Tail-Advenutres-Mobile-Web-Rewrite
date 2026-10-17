import { callAgentRead } from "@/lib/agent/api";
import { avatarSrc } from "@/lib/agent/avatarUrl";
import { env } from "@/lib/env";
import { type SettingsRow, type SettingsView, toSettingsView } from "@/lib/agent/settingsView";

/**
 * §3.12's one read. SERVER ONLY (it reads the session cookie); the shaping lives in
 * `settingsView.ts` so no "use client" file ever imports this one.
 */
export async function loadAgentSettings(): Promise<SettingsView | null> {
  const result = await callAgentRead<SettingsRow>("agent_settings_self");
  if (!result.ok) return null;
  // A scalar jsonb comes back as the object itself, not a one-row array.
  const raw = result.rows as unknown;
  const row = (Array.isArray(raw) ? raw[0] : raw) as SettingsRow | null | undefined;
  if (!row) return null;
  const view = toSettingsView(row);
  return { ...view, profile: { ...view.profile, avatarUrl: avatarSrc(view.profile.avatarUrl, env.supabaseUrl) } };
}
