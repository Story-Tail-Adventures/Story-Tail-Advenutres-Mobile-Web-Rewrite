/**
 * Refresh the cruise catalog from track.cruises. P2.
 *
 * Screens 2.0.9 (Cruises Landing) and 2.3.4 (Search Results — Cruises) need cruise line,
 * ship, itinerary, ports and sailing dates — exactly the set docs/Free-Travel-APIs.md §1.0
 * confirms and §10.1 says to SYNC rather than proxy. This is that sync job. It writes
 * cruise_line, cruise_ship, cruise_port, cruise_sailing, cruise_port_call and
 * cruise_sailing_cabin_price, and it reads what it is allowed to fetch from
 * cruise_sync_scope.
 *
 * THIS FUNCTION HAS NO HUMAN CALLER. Every other function here resolves a client from a
 * token and checks ownership; this one is invoked by pg_cron through public.cruise_sync_tick()
 * (migration 20260909001125), and by a developer with the service-role key. So the auth
 * shape is different from its neighbours and deliberately narrower:
 *
 *   * `verify_jwt = true` in config.toml, same as everything else — the platform check
 *     stays in front, per that file's own argument.
 *   * requireUser() is NOT used, because it presumes a platform_user row and a sync job has
 *     none. Instead the already-verified token's `role` claim must be `service_role`.
 *     Anything else is 403, including a perfectly valid client or agent token: a logged-in
 *     traveler must not be able to spend a metered monthly budget by curling a URL.
 *
 * THE BUDGET IS THE POINT. The provider's free tier is 100 requests a MONTH. Everything
 * about the shape of this — the ledger in cruise_api_request, the per-request re-check in
 * sync.ts, the ceiling below the plan limit, trusting the relay's header over our own count
 * — exists because there is no way to buy an overspent month back. See _shared/cruise/
 * budget.ts, and §24.9.
 *
 * A run that does nothing because the budget is gone returns 200 with status "skipped".
 * That is a correct outcome, not a failure, and it must not page anyone: late in a month on
 * the free tier it is the expected one.
 */
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { forbidden, problem, unauthorized } from "../_shared/problem.ts";
import { serviceClient } from "../_shared/db.ts";
import { writeSystemAuditEvent } from "../_shared/audit.ts";
import { runSync } from "../_shared/cruise/sync.ts";

Deno.serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      // GET is refused rather than treated as a dry run. A sync is a mutation that spends
      // money, and a browser prefetch or a link-preview crawler must not be able to
      // trigger one.
      return problem(forbidden("Use POST to run the cruise sync."));
    }

    requireServiceRole(req);

    const { trigger, scope } = await readBody(req);

    // serviceClient because there is no caller to act as: cruise_* tables have RLS on with
    // no policies at all, audit_event has no insert policy, and the actor is a machine.
    // This is the case _shared/db.ts calls narrow and legitimate.
    const db = serviceClient();

    const apiKey = Deno.env.get("TRACK_CRUISES_API_KEY");
    if (!apiKey) {
      // Distinguished from a budget skip on purpose: "nobody configured this" and "the
      // month is spent" need different responses from whoever reads the log.
      return problem(
        forbidden(
          "TRACK_CRUISES_API_KEY is not set in the function environment. " +
            "See supabase/README.md.",
        ),
      );
    }

    const outcome = await runSync({ db, apiKey, trigger, onlyLabel: scope });

    // One audit row per RUN, with counts in metadata — never one per sailing. The cruise
    // tables are not on CLAUDE.md rule 3's sensitive list (payment_card,
    // card_authorization, commission, client), onboarding-step already sets the precedent
    // for saying so out loud, and a per-row trail would push thousands of inserts through
    // the non-atomic path _shared/audit.ts documents. cruise_sync_run holds the detail.
    await writeSystemAuditEvent(db, {
      eventType: "cruise.synced",
      targetEntity: "cruise_sync_run",
      targetId: outcome.runId,
      metadata: {
        trigger,
        ...(scope ? { scope } : {}),
        status: outcome.status,
        scopesRun: outcome.scopesRun,
        requestsSpent: outcome.requestsSpent,
        rowsUpserted: outcome.rowsUpserted,
        rowsArchived: outcome.rowsArchived,
        monthToDateSpend: outcome.budget.ledgerSpent,
        ceiling: outcome.budget.ceiling,
        quotaRemaining: outcome.budget.quotaRemaining,
        // Positive means quota was spent that our ledger never saw — another environment
        // sharing the key, or the relay's billing cycle not matching the calendar month.
        // Worth having in the trail because it is invisible everywhere else.
        quotaDrift: outcome.budget.drift,
        notes: outcome.notes,
      },
    });

    return json({
      runId: outcome.runId,
      status: outcome.status,
      scopesRun: outcome.scopesRun,
      requestsSpent: outcome.requestsSpent,
      rowsUpserted: outcome.rowsUpserted,
      rowsArchived: outcome.rowsArchived,
      budget: {
        monthToDateSpend: outcome.budget.ledgerSpent,
        ceiling: outcome.budget.ceiling,
        allowanceRemaining: outcome.budget.allowance,
        providerRemaining: outcome.budget.quotaRemaining,
        drift: outcome.budget.drift,
      },
      notes: outcome.notes,
    });
  } catch (err) {
    return problem(err);
  }
});

/**
 * The caller must be the service role.
 *
 * The signature is already checked by the gateway (`verify_jwt = true`), so this only reads
 * the claim — the same division of labour as _shared/auth.ts, which decodes `aal` and `amr`
 * only after getUser() has verified the token. Never trust these claims without that
 * platform check in front.
 */
function requireServiceRole(req: Request): void {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token.");
  }

  const claims = decodeClaims(authorization.slice("Bearer ".length));
  if (claims.role !== "service_role") {
    throw forbidden("The cruise sync runs as the service role, not as a user.");
  }
}

function decodeClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  try {
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

/**
 * `cron` unless a caller says otherwise, because pg_cron is the normal path and its body is
 * `{"trigger":"cron"}`. A malformed or absent body is not an error worth failing a run over.
 *
 * `scope` narrows a manual run to one cruise_sync_scope label. It exists because the unit
 * of cost here is a single HTTP request: verifying one scope's mapping should not spend the
 * other two scopes' requests as collateral. pg_cron never sends it.
 */
async function readBody(
  req: Request,
): Promise<{ trigger: "cron" | "manual"; scope?: string }> {
  try {
    const body = await req.json();
    const trigger = body?.trigger === "manual" ? "manual" : "cron";
    const scope = typeof body?.scope === "string" && body.scope.trim() !== ""
      ? body.scope.trim()
      : undefined;
    return { trigger, scope };
  } catch {
    return { trigger: "cron" };
  }
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
