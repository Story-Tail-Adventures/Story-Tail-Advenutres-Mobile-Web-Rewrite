import { registerPushDeviceAction, unregisterPushDeviceAction, type BrowserSubscription } from "@/lib/agent/pushActions";
import { uuidV7 } from "@/lib/uuid";

/**
 * §3.10 Stage 3b in the browser: the service worker, the permission and the subscription.
 * Browser-only; every function is called from an effect or a click.
 *
 * Permission is asked ONLY from the inbox card's "Turn on" (ruling 7), never on load.
 */

export const SERVICE_WORKER_URL = "/push-sw.js";

/** The public VAPID key. Public by design: it ships in the bundle. */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    vapidPublicKey() !== null
  );
}

/** The key the Push API wants: raw bytes, from the base64url string. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "Chrome · macOS", for §3.12.3's device list later. Coarse on purpose. */
export function deviceLabel(userAgent: string): string | null {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const os = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function asBrowserSubscription(sub: PushSubscription): BrowserSubscription | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return json.endpoint && p256dh && auth ? { endpoint: json.endpoint, keys: { p256dh, auth } } : null;
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function record(sub: PushSubscription): Promise<boolean> {
  const subscription = asBrowserSubscription(sub);
  if (!subscription) return false;
  const { ok } = await registerPushDeviceAction({
    deviceId: uuidV7(),
    subscription,
    label: deviceLabel(navigator.userAgent),
  });
  return ok;
}

/** "dismissed": the advisor closed the browser's prompt without choosing. Not an error. */
export type TurnOnResult = "on" | "blocked" | "dismissed" | "failed";

/** "Turn on": permission, the service worker, a subscription, then the server's record of it. */
export async function turnOnPush(): Promise<TurnOnResult> {
  const key = vapidPublicKey();
  if (!pushSupported() || !key) return "failed";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "dismissed";

    const reg = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }));
    return (await record(sub)) ? "on" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Already on in this browser? Then say so again quietly: it refreshes the server's row and, if
 * someone else signed out of this browser and this advisor signed in, moves it to them.
 */
export async function refreshPushIfOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const sub = await existingSubscription();
    return sub ? await record(sub) : false;
  } catch {
    return false;
  }
}

/**
 * Sign-out (ruling: "signing out stops that device's notifications at once"). The browser drops
 * its subscription, so even a missed server call leaves nothing that can be delivered, and the
 * dispatcher forgets the row on the push service's 410. Never throws, and gives up after a
 * moment so it cannot hold sign-out hostage.
 */
export async function stopPushHere(): Promise<void> {
  if (!pushSupported()) return;
  const work = (async () => {
    const sub = await existingSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    // The browser first: it is local and quick, and once it is done nothing can be delivered
    // here whatever happens to the server call.
    await sub.unsubscribe().catch(() => false);
    await unregisterPushDeviceAction(endpoint);
  })().catch(() => undefined);
  await Promise.race([work, new Promise((r) => setTimeout(r, 2000))]);
}
