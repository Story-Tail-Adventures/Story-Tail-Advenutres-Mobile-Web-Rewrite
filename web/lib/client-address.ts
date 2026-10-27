/**
 * Where the visitor's IP address comes from, in one place.
 *
 * Two call sites need it and they must not drift, because only one of them looks harmless:
 *
 *   lib/supabase/server.ts   passes it to GoTrue so the advisor's Login activity shows the
 *                            traveler's address and not the web server's. Informational.
 *   lib/public/leadMessage.ts forwards it to the lead Edge Function as `x-sta-client-ip`,
 *                            where `clientAddress()` RATE-LIMITS the public lead form on it.
 *
 * ── WHY THE ORDER MATTERS ────────────────────────────────────────────────────────
 *
 * `cf-connecting-ip` first, because it is the only header here trustworthy by construction:
 * Cloudflare sets it from the connection it terminated and strips any copy the client sent, so
 * it cannot be forged from outside. `supabase/functions/_shared/lead.ts` prefers it for
 * exactly the same reason.
 *
 * The left-most `x-forwarded-for` entry is the fallback, and it is only ever as trustworthy as
 * the proxy in front. On Vercel it was safe, because Vercel REPLACES a client-supplied header
 * with the real connection. A proxy that APPENDS instead leaves the left-most entry
 * attacker-chosen, and appending is the more common behaviour. Render's is unverified: see
 * docs/RENDER-MIGRATION.md §5.1 for the forged-header test to run before real traffic.
 *
 * That gap is worth more than it looks on the lead path. `clientAddress()` trusts a forwarded
 * address from any caller holding `STA_LEAD_FORM_KEY`, and this server is such a caller. So a
 * forgeable left-most entry is a forgeable rate-limit bucket, defeated by rotating fake
 * values. Keeping Cloudflare in front is what closes it.
 *
 * This module imports nothing on purpose: a Server Component, a server action and a plain
 * fetch helper all reach it.
 */

/** Just enough of `Headers` to read one value, so a test needs no DOM to call this. */
export interface HeaderReader {
  get(name: string): string | null;
}

/** The visitor's address as the infrastructure in front of us saw it, or null. */
export function visitorAddressFrom(headers: HeaderReader): string | null {
  return (
    boundedAddress(headers.get("cf-connecting-ip")) ??
    boundedAddress(headers.get("x-forwarded-for")?.split(",")[0] ?? null)
  );
}

/** The column is bounded; anything longer is not an address we are willing to pass on. */
function boundedAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 64 ? trimmed : null;
}
