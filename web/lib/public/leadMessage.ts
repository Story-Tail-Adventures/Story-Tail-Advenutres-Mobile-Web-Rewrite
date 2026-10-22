import { env } from "@/lib/env";

/**
 * Screen 2.0.12 "Message Gyasi": the server's one call to `lead-message` (Data-Model §11,
 * BRD §6.5, 2026-10-21). No session: the visitor has no account, which is the point.
 *
 * Server-side only, for two reasons. The form must work without JavaScript, so it posts to a
 * server action anyway. And only the server can vouch for the visitor's address: it sends it
 * as `x-sta-client-ip` beside `x-sta-form-key`, and the function trusts the address only when
 * the key matches (`supabase/functions/_shared/lead.ts`). Without the key the function counts
 * this server's address, which is coarser but never a broken form.
 *
 * Logging: the outcome and status only. Never the body, the email or the address.
 */

export interface LeadMessageInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  page: string | null;
  about: { kind: "trip" | "topic"; slug: string; label: string } | null;
  utm: { source?: string; medium?: string; campaign?: string };
  /** The hidden field only a bot fills. Passed through: the function decides. */
  website: string;
  /** Epoch ms when the form was drawn. */
  startedAt: number;
}

export type LeadMessageResult =
  | { ok: true }
  /** A 400 with a sentence the visitor can act on. */
  | { ok: false; kind: "invalid"; detail: string }
  | { ok: false; kind: "throttled" }
  | { ok: false; kind: "unavailable" };

function functionUrl(): string {
  return `${env.supabaseUrl.replace(/\/+$/, "")}/functions/v1/lead-message`;
}

export async function sendLeadMessage(
  input: LeadMessageInput,
  visitorAddress: string | null,
): Promise<LeadMessageResult> {
  if (env.authChecksDisabledForLocalDev) return { ok: false, kind: "unavailable" };

  const headers: Record<string, string> = {
    apikey: env.supabaseAnonKey,
    authorization: `Bearer ${env.supabaseAnonKey}`,
    "content-type": "application/json",
  };
  const key = env.leadFormKey;
  if (key && visitorAddress) {
    headers["x-sta-form-key"] = key;
    headers["x-sta-client-ip"] = visitorAddress;
  }

  let res: Response;
  try {
    res = await fetch(functionUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        message: input.message,
        page: input.page,
        about: input.about,
        utm: input.utm,
        website: input.website,
        startedAt: input.startedAt,
      }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[lead-message] send failed", err instanceof Error ? err.name : "error");
    return { ok: false, kind: "unavailable" };
  }

  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, kind: "throttled" };
  if (res.status === 400) {
    const detail = await res
      .json()
      .then((b: { detail?: unknown }) => (typeof b?.detail === "string" ? b.detail : null))
      .catch(() => null);
    if (detail) return { ok: false, kind: "invalid", detail };
  }
  console.error("[lead-message] send refused", res.status);
  return { ok: false, kind: "unavailable" };
}

/**
 * The visitor's address as the platform in front of us saw it: the left-most
 * `x-forwarded-for` entry, which Vercel sets from the connection. Null when absent.
 */
export function visitorAddressFrom(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first && first.length <= 64 ? first : null;
}
