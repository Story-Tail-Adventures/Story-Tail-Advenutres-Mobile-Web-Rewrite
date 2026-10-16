/**
 * §3.10 Stage 3b: what a notification says, and where it may be sent (Screen Inventory
 * §3.10.7, Data-Model §12.6 / §12.7).
 *
 * Pure: no network, no database (problem.ts only builds error values). `push-dispatch` claims rows and hands them here; the senders
 * it injects into `deliver` do the I/O. That keeps every rule below testable in CI, where
 * Deno runs with `--allow-env` only.
 *
 * ── WHAT A PAYLOAD HOLDS ─────────────────────────────────────────────────────
 *
 * A web payload is end-to-end encrypted to the advisor's browser (RFC 8291), so it carries
 * the words: the client's name, the trip and the first line. An Android payload goes through
 * Google readable, so it carries the thread id and a count only (`_shared/fcm.ts`), and the app fetches
 * the words itself. See docs/Push-Notifications-Security-Review.md §3.1. Neither ever holds
 * card data.
 *
 * ── ONE NOTIFICATION PER THREAD ──────────────────────────────────────────────
 *
 * The tag is the conversation id, so the next message replaces the last one on the device,
 * and a dismiss names the same tag to clear it. The morning summary has its own tag.
 */

import { maskCardNumbers } from "./cardDigits.ts";
import { badRequest } from "./problem.ts";

export type PushPlatform = "android" | "web" | "ios";

/** A row `push_claim_due` hands out. */
export interface ClaimedRow {
  outbox_id: string;
  agent_id: string;
  conversation_id: string;
  held: boolean;
  message_count: number;
  client_name: string | null;
  trip_title: string | null;
  preview: string | null;
  /** As PostgREST writes timestamptz, microseconds and all. Never parsed into a Date to send. */
  latest_created_at: string;
}

/** A row `push_devices_for_agent` returns. */
export interface PushDevice {
  device_id: string;
  platform: PushPlatform;
  fcm_token: string | null;
  web_endpoint: string | null;
  web_p256dh: string | null;
  web_auth: string | null;
}

export interface MessagePayload {
  v: 1;
  kind: "message";
  tag: string;
  conversationId: string;
  /**
   * The created_at of the newest message this is about, as text (agent-message's `seenUpTo`).
   * "Mark read" reads up to here and no further, so anything newer stays unread.
   */
  seenUpTo: string;
  title: string;
  body: string;
  count: number;
  url: string;
}

export interface SummaryPayload {
  v: 1;
  kind: "summary";
  tag: typeof SUMMARY_TAG;
  /** Messages it covers. The phone builds its own words from this (no names through Google). */
  count: number;
  title: string;
  body: string;
  url: string;
}

export interface DismissPayload {
  v: 1;
  kind: "dismiss";
  tag: string;
  /**
   * The created_at (as text) of the newest message the dismissed notification was about. A phone
   * ignores a dismiss older than the notification it is showing, so a dismiss that arrives late
   * (FCM does not promise order) cannot cancel a newer message for the same thread.
   */
  readUpTo: string | null;
}

export type PushPayload = MessagePayload | SummaryPayload | DismissPayload;

export const SUMMARY_TAG = "summary";
export const INBOX_URL = "/agent/messages";

/** The thread, with the reply box ready (the web has no reply-in-notification; ruling 3). */
export function threadUrl(conversationId: string): string {
  return `${INBOX_URL}/${conversationId}?reply=1`;
}

/** Shown when a message has no text of its own (an attachment only). */
export const NO_PREVIEW = "Sent you a message.";

/** "Jordan Hayes · Anniversary Week in Negril", or the name alone for a thread with no trip. */
export function messageTitle(clientName: string | null, tripTitle: string | null): string {
  const name = clientName?.trim() || "A client";
  const trip = tripTitle?.trim();
  return trip ? `${name} · ${trip}` : name;
}

/**
 * Clients sometimes paste a card number into a message. The thread already holds it, but a
 * notification would copy it onto a lock screen and into the system's notification history,
 * so the notification shows the last four only. The rule that finds it is the guard's
 * (cardDigits.ts, Data-Model §18): any span of whole digit groups that joins to 13 to 19
 * digits and passes Luhn.
 */
export { maskCardNumbers } from "./cardDigits.ts";

export function messagePayload(row: ClaimedRow): MessagePayload {
  return {
    v: 1,
    kind: "message",
    tag: row.conversation_id,
    conversationId: row.conversation_id,
    seenUpTo: row.latest_created_at,
    title: messageTitle(row.client_name, row.trip_title),
    body: maskCardNumbers(row.preview?.trim() || NO_PREVIEW),
    count: row.message_count,
    url: threadUrl(row.conversation_id),
  };
}

/** "Jordan Hayes", "Jordan Hayes and Maya Carter", "A, B and C", "A, B, C and 2 others". */
export function nameList(names: string[]): string {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return "Your clients";
  if (unique.length === 1) return unique[0];
  if (unique.length <= 3) return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
  const rest = unique.length - 3;
  return `${unique.slice(0, 3).join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

/** How far back "overnight" may honestly reach. A Sunday's messages are older than this. */
const OVERNIGHT_HOURS = 11;

/**
 * The one 7am notification for everything that waited through rest hours (ruling 6):
 * "3 new messages while you rested" / "Jordan Hayes, Maya Carter and Sam Rivera wrote
 * overnight." It says "overnight" only when every message really came overnight; a Sunday's
 * worth reads "while you rested", which is true of both.
 */
export function summaryPayload(rows: ClaimedRow[], now: Date): SummaryPayload {
  const count = rows.reduce((n, r) => n + Math.max(1, r.message_count), 0);
  const oldest = Math.min(
    ...rows.map((r) => Date.parse(r.latest_created_at) || now.getTime()),
  );
  const overnight = now.getTime() - oldest <= OVERNIGHT_HOURS * 3_600_000;
  const names = nameList(rows.map((r) => r.client_name ?? ""));
  return {
    v: 1,
    kind: "summary",
    tag: SUMMARY_TAG,
    count,
    title: `${count} new ${count === 1 ? "message" : "messages"} while you rested`,
    body: `${names} wrote ${overnight ? "overnight" : "while you rested"}.`,
    url: INBOX_URL,
  };
}

export function dismissPayload(conversationId: string, readUpTo: string | null = null): DismissPayload {
  return { v: 1, kind: "dismiss", tag: conversationId, readUpTo };
}

/** What one claimed batch sends for one advisor: each live row alone, the held ones as one. */
export interface Send {
  outboxIds: string[];
  payload: MessagePayload | SummaryPayload;
}

export function planForAgent(rows: ClaimedRow[], now: Date): Send[] {
  const live = rows.filter((r) => !r.held);
  const held = rows.filter((r) => r.held);
  const sends: Send[] = live.map((r) => ({ outboxIds: [r.outbox_id], payload: messagePayload(r) }));
  if (held.length > 0) {
    sends.push({ outboxIds: held.map((r) => r.outbox_id), payload: summaryPayload(held, now) });
  }
  return sends;
}

export function groupByAgent<T extends { agent_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.agent_id) ?? [];
    list.push(r);
    out.set(r.agent_id, list);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Where a web subscription may point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The browsers' own push services. A subscription endpoint is a URL the BROWSER chose, but it
 * reaches us in a request body, and `push-dispatch` POSTs to it with our signature. Without
 * this list an advisor's token could register `http://10.0.0.1/...` and turn the dispatcher
 * into a request forwarder inside Supabase's network. So: https, the standard port, and one of
 * these hosts or their subdomains, or the registration is refused.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Opera, Brave
  "updates.push.services.mozilla.com", // Firefox
  "push.services.mozilla.com",
  "notify.windows.com", // Edge on Windows (wns2-*.notify.windows.com)
  "push.apple.com", // Safari (web.push.apple.com)
];

export const MAX_ENDPOINT_LENGTH = 1024;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a registration
// ─────────────────────────────────────────────────────────────────────────────

export interface WebSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Base64url, as the Push API hands out keys. Long enough for a P-256 key, short enough to bound. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,200}={0,2}$/;

/**
 * A browser's `PushSubscription.toJSON()`: `{ endpoint, keys: { p256dh, auth } }`. Refused unless
 * the endpoint is one of the push services above.
 */
export function readWebSubscription(value: unknown): WebSubscription {
  const v = (value ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = v.endpoint;
  const p256dh = v.keys?.p256dh;
  const auth = v.keys?.auth;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
    throw badRequest("This browser's notification address isn't one we can send to.");
  }
  if (typeof p256dh !== "string" || !KEY_PATTERN.test(p256dh) ||
      typeof auth !== "string" || !KEY_PATTERN.test(auth)) {
    throw badRequest("This browser's notification keys are missing.");
  }
  return { endpoint, p256dh, auth };
}

/** An FCM registration token: opaque, URL-safe-ish, bounded. Never echoed back. */
const FCM_TOKEN_PATTERN = /^[A-Za-z0-9_:\-]{20,4096}$/;

export function readFcmToken(value: unknown): string {
  if (typeof value !== "string" || !FCM_TOKEN_PATTERN.test(value)) {
    throw badRequest("This phone's notification token is missing.");
  }
  return value;
}

export const MAX_LABEL_LENGTH = 80;

/** "Chrome · macOS": shown later in §3.12.3's device list. Optional, trimmed, bounded. */
export function readDeviceLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw badRequest("label must be text.");
  const t = value.trim().slice(0, MAX_LABEL_LENGTH);
  return t || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What one device said. `gone` is the push service telling us the subscription is dead (404 or
 * 410): the device is forgotten, and that is not a failure of the send. `skipped` is a
 * platform this build cannot reach yet (iOS until Xcode).
 */
export type DeviceOutcome = "ok" | "gone" | "error" | "skipped";

export type DeviceSender = (device: PushDevice, payload: PushPayload) => Promise<DeviceOutcome>;

export interface DeliveryResult {
  /** The row may be marked sent: at least one device took it, or nothing was left to try. */
  ok: boolean;
  goneDeviceIds: string[];
}

/**
 * Send one payload to every device of one advisor. It counts as delivered if ANY device took
 * it, because the advisor will see it there, and reading it anywhere clears it everywhere. It
 * counts as failed only when a device errored and none succeeded, so a retry is worth it.
 * Every device gone or skipped is "nothing left to try": retrying would only repeat that.
 */
export async function deliver(
  devices: PushDevice[],
  payload: PushPayload,
  send: DeviceSender,
): Promise<DeliveryResult> {
  const outcomes = await Promise.all(
    devices.map(async (d) => {
      try {
        return { d, o: await send(d, payload) };
      } catch (err) {
        // The sender's own message only (a status, never a token, key or body).
        console.error(`push: ${d.platform} send failed:`, err instanceof Error ? err.message : "unknown");
        return { d, o: "error" as const };
      }
    }),
  );
  const goneDeviceIds = outcomes.filter((x) => x.o === "gone").map((x) => x.d.device_id);
  const anyOk = outcomes.some((x) => x.o === "ok");
  const anyError = outcomes.some((x) => x.o === "error");
  return { ok: anyOk || !anyError, goneDeviceIds };
}

/** The push service's answer, as a DeviceOutcome. */
export function outcomeForStatus(status: number): DeviceOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  return "error";
}
