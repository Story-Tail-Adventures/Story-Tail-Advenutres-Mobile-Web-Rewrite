/**
 * Sending to a browser: Web Push with our own VAPID keys (RFC 8291 encryption, RFC 8292
 * signing), through `web-push` 3.6.7. Approved in docs/Push-Notifications-Security-Review.md
 * §2; the version is pinned in deno.json.
 *
 * The library builds the request (encrypts the payload, signs the VAPID header) and we post it
 * with our own `fetch`, so its Node HTTP path never runs. The endpoint was checked against the
 * push-service list when the device registered (`isAllowedPushEndpoint`), and is checked again
 * here, so a row written any other way still cannot aim the dispatcher somewhere else.
 *
 * Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: URL the
 * push services can reach us at). The private key never leaves the function environment.
 */
import webpush from "web-push";
import {
  type DeviceOutcome,
  type DeviceSender,
  isAllowedPushEndpoint,
  outcomeForStatus,
  type PushDevice,
  type PushPayload,
} from "./push.ts";

/** How long a push service keeps an undelivered notification. A day-old "new message" is noise. */
const TTL_SECONDS = 12 * 3600;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFromEnv(): VapidConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * The push service's "topic": a later notification with the same topic replaces one still
 * waiting undelivered (a phone in a drawer gets the newest, not three). At most 32 URL-safe
 * characters, so a uuid without its dashes.
 */
export function topicFor(payload: PushPayload): string {
  return payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

export function webPushSender(vapid: VapidConfig): DeviceSender {
  return async (device: PushDevice, payload: PushPayload): Promise<DeviceOutcome> => {
    if (device.platform !== "web") return "skipped";
    const { web_endpoint: endpoint, web_p256dh: p256dh, web_auth: auth } = device;
    if (!endpoint || !p256dh || !auth || !isAllowedPushEndpoint(endpoint)) return "gone";

    const details = webpush.generateRequestDetails(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        TTL: TTL_SECONDS,
        // A dismiss should land while the notification is still on screen.
        urgency: payload.kind === "dismiss" ? "high" : "normal",
        topic: topicFor(payload),
      },
    );

    const res = await fetch(details.endpoint, {
      method: details.method,
      headers: details.headers as Record<string, string>,
      // A copy: fetch wants an ArrayBuffer-backed view, and the library hands back a Buffer.
      body: new Uint8Array(details.body as Uint8Array),
      // Never follow a redirect: the allowlist was checked on THIS url, not wherever it points.
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    // A redirect (or the opaque 0 a manual redirect can report) is not a delivery.
    if (res.status === 0 || (res.status >= 300 && res.status < 400)) return "error";
    return outcomeForStatus(res.status);
  };
}
