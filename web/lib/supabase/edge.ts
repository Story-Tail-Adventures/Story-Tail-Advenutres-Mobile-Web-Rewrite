import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Calling a Supabase Edge Function from the server, with the caller's own access token.
 *
 * EXTRACTED FROM `lib/trips/api.ts` WHEN §3.2 NEEDED A SECOND DOOR. The agent side could
 * not reuse `callTripFunction` — its union is documented as §2.x writes on the traveler's
 * session, and widening it to carry an agent route would make the type stop meaning
 * anything. Copying the body instead would have duplicated the part that matters: the
 * access token is forwarded and the service-role key never is, because that key does not
 * exist in `web/` at all (Data-Model §21.2, and PR #47 was closed rather than change it).
 * Security-relevant transport that exists twice is transport that eventually differs.
 *
 * So there is one implementation and two typed doors over it. `callTripFunction` and
 * `callAgentFunction` each keep their own union; neither can accidentally call the other's
 * routes.
 *
 * WHY THIS IS SERVER-SIDE AT ALL: the access token lives in an httpOnly cookie. A client
 * component cannot read it, and giving it one that could is a worse trade than a round trip.
 */

/**
 * `conflict` IS THE 409, CARRIED RATHER THAN RE-DERIVED. It was previously spread into the
 * rejected arm as an untyped property — TypeScript skips excess-property checking on a
 * spread, so it compiled and no caller could ever read it. The status code was available at
 * the one place that has it and was thrown away there, and `changeTripStage` recovered the
 * same signal by substring-matching the Edge Function's English sentence ("moved since").
 * Reword that sentence and optimistic-lock detection silently stops working, with nothing in
 * the type checker or the tests to notice. So it is a declared field now.
 *
 * DECLARING IT IS ONLY HALF THE FIX, and the half that changes nothing on its own. The
 * caller has to READ it. `changeTripStage` in `app/(agent)/agent/pipeline/actions.ts` is
 * the one consumer today, and it must derive staleness from `result.conflict === true` —
 * never from `(result.detail ?? "").includes("moved since")`, which is the substring match
 * this field exists to retire. A typed signal nothing consumes is the same dead-signal
 * shape the field was added to remove. Any later caller of an Edge Function with an
 * optimistic lock inherits the same rule.
 */
export type EdgeCallResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      kind: "unauthenticated" | "rejected" | "unavailable";
      detail?: string;
      /** True only on an HTTP 409 — the optimistic-lock rejection. */
      conflict?: boolean;
    };

export type EdgeCallInit =
  | { method: "GET"; query: Record<string, string> }
  | { method: "POST"; body: Record<string, unknown> };

export async function callEdgeFunction(
  fn: string,
  init: EdgeCallInit,
  /** Log prefix, so a failure says which surface it came from. Never the body. */
  logTag: string,
): Promise<EdgeCallResult> {
  if (env.authChecksDisabledForLocalDev) {
    return { ok: false, kind: "unavailable" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, kind: "unauthenticated" };
  }

  const url = new URL(`${env.supabaseUrl}/functions/v1/${fn}`);
  if (init.method === "GET") {
    for (const [key, value] of Object.entries(init.query)) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.method === "POST" ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch (cause) {
    // Never log the body: on the client side it is a traveler's message text or a document
    // filename; on the agent side it is a trip id and a stage.
    console.warn(`[${logTag}] request failed`, { fn, cause: String(cause) });
    return { ok: false, kind: "unavailable" };
  }

  if (response.ok) {
    return { ok: true, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, kind: "unauthenticated" };
  }

  if (response.status >= 400 && response.status < 500) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* not a problem+json body */
    }
    return { ok: false, kind: "rejected", detail, conflict: response.status === 409 };
  }

  console.warn(`[${logTag}] function failed`, { fn, status: response.status });
  return { ok: false, kind: "unavailable" };
}
