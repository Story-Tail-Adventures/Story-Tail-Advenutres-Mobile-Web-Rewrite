"use server";

import { revalidatePath } from "next/cache";

import { callAgentFunction } from "@/lib/agent/api";
import { avatarSrc } from "@/lib/agent/avatarUrl";
import { env } from "@/lib/env";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import type { SocialLinks, WeeklySchedule } from "@/lib/agent/settingsRules";

/**
 * §3.12's writes, all through `agent-settings`, which audits each one in its own SQL
 * transaction. The Edge Function decides; these only carry the form across.
 */

export type SettingsResult =
  | { ok: true; outcome: string; avatarUrl?: string }
  | { ok: false; message: string };

const PATH = "/agent/settings";

async function call(body: Record<string, unknown>): Promise<SettingsResult> {
  const result = await callAgentFunction("agent-settings", body);
  if (result.ok) {
    revalidatePath(PATH);
    return {
      ok: true,
      outcome: String(result.data.outcome ?? ""),
      // The function answers with the stored path; the browser needs it on our public origin.
      ...(typeof result.data.avatarPath === "string"
        ? { avatarUrl: avatarSrc(result.data.avatarPath, env.supabaseUrl) ?? undefined }
        : {}),
    };
  }
  return { ok: false, message: (result.kind === "rejected" && result.detail) || SETTINGS_COPY.saveFailed };
}

export async function saveProfileAction(input: {
  displayName: string;
  pronouns: string;
  phone: string;
  bio: string;
  socialLinks: SocialLinks;
}): Promise<SettingsResult> {
  return call({ ...input, op: "update_profile" });
}

/** `image` is base64 of a square image the browser already made (400×400). */
export async function setAvatarAction(input: { image: string }): Promise<SettingsResult> {
  return call({ op: "set_avatar", image: input.image });
}

export async function removeAvatarAction(): Promise<SettingsResult> {
  return call({ op: "remove_avatar" });
}

export async function saveAvailabilityAction(input: {
  timeZone: string;
  weeklySchedule: WeeklySchedule;
  responseTimeHours: number;
}): Promise<SettingsResult> {
  return call({ ...input, op: "update_availability" });
}

export async function saveTimeOffAction(input: {
  timeOffId: string;
  isNew: boolean;
  startsOn: string;
  endsOn: string;
  label: string;
  autoReplyEnabled: boolean;
  autoReplyText: string;
}): Promise<SettingsResult> {
  return call({ ...input, op: "save_time_off" });
}

export async function endTimeOffAction(input: { timeOffId: string }): Promise<SettingsResult> {
  return call({ op: "end_time_off", timeOffId: input.timeOffId });
}

/** §3.12.3: the four switches, saved together. */
export async function saveNotificationsAction(input: {
  clientMessagesPush: boolean;
  clientMessagesEmail: boolean;
  quoteRequestsPush: boolean;
  quoteRequestsEmail: boolean;
}): Promise<SettingsResult> {
  return call({ ...input, op: "update_notifications" });
}

/** §3.12.4: empty means "use the default". */
export async function saveSignatureAction(input: { signature: string }): Promise<SettingsResult> {
  return call({ signature: input.signature, op: "update_signature" });
}
