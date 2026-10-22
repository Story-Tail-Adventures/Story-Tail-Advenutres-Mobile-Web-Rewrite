import { env } from "@/lib/env";

/**
 * §3.10 Stage 4: the "Stop emailing me about messages" page's two calls to `email-unsubscribe`
 * (Data-Model §12.9). No session: the visitor may not be signed in, and the 128-bit token in the
 * link is the credential. Server-side only, so the token never sits in a client bundle's fetch.
 */
export type UnsubscribeStatus = "on" | "off" | "invalid" | "unavailable";

/** A token as the email carries it: 26 base32 characters. Anything else is not worth a call. */
export function isEmailToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-z2-7]{26}$/i.test(value);
}

function functionUrl(): string {
  return `${env.supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-unsubscribe`;
}

function readStatus(payload: unknown): UnsubscribeStatus {
  const s = (payload as { status?: unknown } | null)?.status;
  return s === "on" || s === "off" || s === "invalid" ? s : "unavailable";
}

/** What the switch is now. A GET: it changes nothing, so a link scanner unsubscribes no one. */
export async function unsubscribeStatus(token: string): Promise<UnsubscribeStatus> {
  if (!isEmailToken(token)) return "invalid";
  try {
    const res = await fetch(`${functionUrl()}?t=${encodeURIComponent(token)}`, {
      headers: { apikey: env.supabaseAnonKey },
      cache: "no-store",
    });
    if (!res.ok) {
      // The status only: the URL carries the token.
      console.error("email unsubscribe: status read failed", res.status);
      return "unavailable";
    }
    return readStatus(await res.json());
  } catch (err) {
    console.error("email unsubscribe: status read failed", err instanceof Error ? err.message : "error");
    return "unavailable";
  }
}

/** Turn the messages email off, or back on. */
export async function setMessagesEmail(token: string, on: boolean): Promise<UnsubscribeStatus> {
  if (!isEmailToken(token)) return "invalid";
  try {
    const res = await fetch(functionUrl(), {
      method: "POST",
      headers: { apikey: env.supabaseAnonKey, "content-type": "application/json" },
      body: JSON.stringify({ token, on }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("email unsubscribe: update failed", res.status);
      return "unavailable";
    }
    return readStatus(await res.json());
  } catch (err) {
    console.error("email unsubscribe: update failed", err instanceof Error ? err.message : "error");
    return "unavailable";
  }
}
