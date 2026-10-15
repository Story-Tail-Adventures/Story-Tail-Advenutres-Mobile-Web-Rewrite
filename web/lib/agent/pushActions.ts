"use server";

import { callAgentFunction } from "@/lib/agent/api";

/**
 * §3.10 Stage 3b: this browser's notifications on and off, through `push-device`.
 *
 * In lib/ rather than beside the inbox because sign-out uses the second one, and sign-out lives
 * in the top bar on every agent page.
 */

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** "Turn on": record where this browser can be reached. */
export async function registerPushDeviceAction(input: {
  deviceId: string;
  subscription: BrowserSubscription;
  label: string | null;
}): Promise<{ ok: boolean }> {
  const result = await callAgentFunction("push-device", {
    op: "register",
    platform: "web",
    deviceId: input.deviceId,
    subscription: input.subscription,
    ...(input.label ? { label: input.label } : {}),
  });
  return { ok: result.ok };
}

/** Sign-out: forget this browser before the session ends. Quietly best effort. */
export async function unregisterPushDeviceAction(endpoint: string): Promise<void> {
  await callAgentFunction("push-device", { op: "unregister", endpoint });
}
