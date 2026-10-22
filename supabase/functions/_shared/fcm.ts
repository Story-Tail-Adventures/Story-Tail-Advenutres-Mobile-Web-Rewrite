/**
 * Sending to an Android phone: Firebase Cloud Messaging's HTTP v1 API, with no Firebase SDK on
 * the server (docs/Push-Notifications-Security-Review.md §3). A service-account key signs a
 * short-lived JWT (RS256, WebCrypto), Google trades it for an access token, and one POST per
 * device sends the message.
 *
 * ── WHAT GOOGLE CAN READ ────────────────────────────────────────────────────
 *
 * An FCM payload is NOT end-to-end encrypted, so it carries no words: the kind, the thread id,
 * a count and the `seenUpTo` timestamp (§3.1 b, "fetch on receipt"). The app reads the client's
 * name, the trip and the first line from our own API over its own session, and builds the
 * notification itself. `androidData` is the only thing that decides what goes to Google, and its
 * test pins that no name or message text can reach it.
 *
 * It is a DATA message (no `notification` block), sent at high priority, so the app's
 * messaging service runs even in the background and draws the notification its own way: the
 * locked-screen rule, Reply and Mark read.
 *
 * Secret: FCM_SERVICE_ACCOUNT_JSON, the key file Firebase hands out. It can send to our app and
 * nothing else.
 */
import { type DeviceOutcome, type DeviceSender, type PushDevice, type PushPayload } from "./push.ts";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TTL_SECONDS = 12 * 3600;

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function serviceAccountFromEnv(): ServiceAccount | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (sa.project_id && sa.client_email && sa.private_key) {
      return { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key };
    }
  } catch {
    // Fall through: the same answer as a key with fields missing.
  }
  // Set but unusable is not the same as unset, and says so (never the value). A multi-line
  // paste is the usual cause; see supabase/README.md.
  console.error("push: FCM_SERVICE_ACCOUNT_JSON is set but is not a usable service-account key");
  return null;
}

/**
 * What an Android device is sent: strings only (FCM data values must be strings), and nothing a
 * reader at Google could learn a client from. The summary carries its count; the app names the
 * clients from its own inbox read.
 */
export function androidData(payload: PushPayload): Record<string, string> {
  switch (payload.kind) {
    case "message":
      return {
        v: "1",
        kind: "message",
        tag: payload.tag,
        conversationId: payload.conversationId,
        seenUpTo: payload.seenUpTo,
        count: String(payload.count),
      };
    case "summary":
      return { v: "1", kind: "summary", tag: payload.tag, count: String(payload.count) };
    case "dismiss":
      return {
        v: "1",
        kind: "dismiss",
        tag: payload.tag,
        ...(payload.readUpTo ? { readUpTo: payload.readUpTo } : {}),
      };
    // §3.12.3. Ids only, like a message: the phone reads the name over its own session.
    case "quote_request":
      return { v: "1", kind: "quote_request", tag: payload.tag, tripId: payload.tripId };
  }
}

/** The FCM v1 message for one device. `collapse_key` keeps one waiting message per thread. */
export function fcmMessage(token: string, payload: PushPayload) {
  return {
    message: {
      token,
      data: androidData(payload),
      android: { priority: "HIGH", ttl: `${TTL_SECONDS}s`, collapse_key: payload.tag.slice(0, 64) },
    },
  };
}

/**
 * FCM's answer as a DeviceOutcome. ONLY the `UNREGISTERED` error code means the token is dead. A
 * bare 404 is not enough: FCM answers 404 for a wrong project too, and treating that as "gone"
 * would make one misconfigured key delete every advisor's phone. A 400 is our own request.
 */
export function fcmOutcome(status: number, errorCode: string | null): DeviceOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (errorCode === "UNREGISTERED") return "gone";
  return "error";
}

function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let s = "";
  for (const b of raw) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/** The signed assertion Google's token endpoint takes (RFC 7523). Exported for its test. */
export async function signedAssertion(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${base64Url(sig)}`;
}

/**
 * One access token per hour, reused across a pass (and across warm invocations). The PROMISE is
 * cached, so a pass that sends to several phones at once signs and exchanges once, not per phone.
 */
let cached: { token: Promise<string>; expiresAt: number } | null = null;

function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;
  const token = exchange(sa, now);
  cached = { token, expiresAt: now + 3_000_000 };
  // A failed exchange must not be remembered for the hour.
  token.catch(() => {
    if (cached?.token === token) cached = null;
  });
  return token;
}

async function exchange(sa: ServiceAccount, now: number): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signedAssertion(sa, Math.floor(now / 1000)),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`FCM token exchange failed: ${res.status}`);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("FCM token exchange returned no token");
  return body.access_token;
}

export function fcmSender(sa: ServiceAccount): DeviceSender {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  return async (device: PushDevice, payload: PushPayload): Promise<DeviceOutcome> => {
    if (device.platform !== "android") return "skipped";
    if (!device.fcm_token) return "gone";
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(sa)}`, "content-type": "application/json" },
      body: JSON.stringify(fcmMessage(device.fcm_token, payload)),
      signal: AbortSignal.timeout(10_000),
    });
    let errorCode: string | null = null;
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { details?: { errorCode?: string }[] } }
        | null;
      errorCode = body?.error?.details?.find((d) => d.errorCode)?.errorCode ?? null;
      // Status and code only: never the token, the request or the response body.
      console.error(`push: FCM answered ${res.status}${errorCode ? ` (${errorCode})` : ""}`);
      // A revoked or rotated access token: forget it, so the next send exchanges afresh.
      if (res.status === 401) cached = null;
    } else {
      await res.body?.cancel();
    }
    return fcmOutcome(res.status, errorCode);
  };
}
