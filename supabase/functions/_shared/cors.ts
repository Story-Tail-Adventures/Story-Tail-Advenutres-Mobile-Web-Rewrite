/**
 * CORS for Edge Functions.
 *
 * The allowed origin comes from an env var, never `*`. A wildcard is fine while
 * `supabase functions serve` is running on a laptop and wrong the moment the function
 * is deployed — and the deploy is exactly when nobody re-reads this file.
 */

const DEFAULT_DEV_ORIGIN = "http://localhost:3000";

function allowedOrigin(): string {
  return Deno.env.get("ALLOWED_ORIGIN") ?? DEFAULT_DEV_ORIGIN;
}

export function buildCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Convenience for handlers that just want to spread the headers. */
export const corsHeaders: Record<string, string> = buildCorsHeaders();

/** Returns a preflight response, or null when this isn't a preflight request. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: buildCorsHeaders() });
}
