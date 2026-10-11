/**
 * The commission ledger's write door. Screens 3.7.3 (edit, mark received, remove), 3.7.4
 * (add) and §3.7.2's export.
 *
 * ── THE AUDIT ROW IS NOT WRITTEN HERE ──────────────────────────────────────────
 *
 * Every other agent route calls `writeAuditEvent` after its RPC returns — a second round
 * trip, so a failed audit insert leaves a landed change with no record. These routes don't:
 * each SQL function writes its own `audit_event` in the same transaction as the change
 * (`commission_audit()`, migration 20261011120000), as `_shared/audit.ts` asks for before
 * the first financial mutation. What this route supplies is the row's v7 id, the actor's
 * platform_user id, and the caller's ip and user agent. Nothing about WHAT is audited is up
 * to it — that lives next to the change.
 *
 * ── ONLY `stale` IS A 409 ──────────────────────────────────────────────────────
 *
 * The house shape (`agent-client`): the optimistic-lock failure keeps the 409 so the web's
 * `EdgeCallResult.conflict` can carry it, and every outcome a form should show against a
 * field comes back 200 with an `outcome` — `duplicate_reference`, `supplier_not_found`,
 * `bad_date`, `not_removable`. A rejection's body surfaces only `detail`, which a form
 * cannot attach to a field.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId, requireExpectedVersion } from "../_shared/agent.ts";
import {
  COMMISSION_STATUSES,
  CREATE_STATUSES,
  type ExportRow,
  PAYMENT_STATUSES,
  readCents,
  readDate,
  readId,
  readLagDays,
  readLedgerFilters,
  readNotes,
  readRate,
  readReference,
  readStatus,
  readTerms,
  toCsv,
} from "../_shared/commission.ts";

const OPS = ["create", "update", "payment", "remove", "export"] as const;
type Op = (typeof OPS)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function requireOp(value: unknown): Op {
  if (typeof value !== "string" || !OPS.includes(value as Op)) {
    throw badRequest(`op must be one of: ${OPS.join(", ")}.`);
  }
  return value as Op;
}

/** The first row of an RPC that RETURNS TABLE, or null when it returned none. */
function first<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

/** The fields the add and edit forms share. Expected is NOT among them — SQL computes it. */
function readLine(payload: Record<string, unknown>) {
  return {
    p_supplier_id: readId(payload.supplierId, "supplier"),
    p_gross_cents: readCents(payload.grossCents, "Gross"),
    p_commission_pct: readRate(payload.commissionPct),
    p_payment_terms: readTerms(payload.paymentTerms),
    p_payment_lag_days: readLagDays(payload.paymentLagDays),
    p_inteletravel_reference: readReference(payload.inteletravelReference),
    p_notes: readNotes(payload.notes),
  };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    const db = agentDb();
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);
    const op = requireOp(payload.op);

    // What every SQL write needs for its own audit row. A fresh v7 per request.
    const audit = {
      p_actor_user_id: ctx.platformUserId,
      p_audit_id: uuidV7(),
      p_ip: ctx.ip,
      p_user_agent: ctx.userAgent,
    };

    // ── 3.7.4 Add ─────────────────────────────────────────────────────────
    if (op === "create") {
      // v7, minted here (Data-Model §21.6), so the redirect target is known before the write.
      const commissionId = uuidV7();
      const { data, error } = await db.rpc("agent_create_commission", {
        p_agent_id: agentId,
        p_commission_id: commissionId,
        p_trip_id: readId(payload.tripId, "trip"),
        p_status: readStatus(payload.status ?? "expected", CREATE_STATUSES),
        ...readLine(payload),
        ...audit,
      } as never);
      if (error) throw new Error(`commission create failed: ${error.message}`);

      const result = first<{ outcome: string; commission_id: string; version: number }>(data);
      if (!result) throw notFound("That advisor cannot add commission lines.");
      if (result.outcome === "trip_not_found") throw notFound("No such trip on your book.");
      if (result.outcome !== "created") return json({ outcome: result.outcome });

      return json({ outcome: "created", commissionId, version: result.version });
    }

    // ── §3.7.2 Export ─────────────────────────────────────────────────────
    if (op === "export") {
      const { data, error } = await db.rpc("agent_export_commission", {
        p_agent_id: agentId,
        ...readLedgerFilters(payload.filters),
        ...audit,
      } as never);
      if (error) throw new Error(`commission export failed: ${error.message}`);

      const rows = (data ?? []) as ExportRow[];
      return json({ outcome: "exported", rowCount: rows.length, csv: toCsv(rows) });
    }

    // Everything below names one existing line at the version the screen rendered.
    const commissionId = readId(payload.commissionId, "commission line");
    const expectedVersion = requireExpectedVersion(payload.expectedVersion);

    // ── 3.7.3 Edit ────────────────────────────────────────────────────────
    if (op === "update") {
      const { data, error } = await db.rpc("agent_update_commission", {
        p_agent_id: agentId,
        p_commission_id: commissionId,
        p_expected_version: expectedVersion,
        p_status: readStatus(payload.status, COMMISSION_STATUSES),
        ...readLine(payload),
        ...audit,
      } as never);
      if (error) throw new Error(`commission update failed: ${error.message}`);

      const result = first<{ outcome: string; version: number }>(data);
      if (!result || result.outcome === "not_found") throw notFound("No such commission line.");
      if (result.outcome === "stale") {
        throw conflict("This line changed since you opened it. Reload and try again.");
      }
      if (result.outcome === "needs_payment") {
        // The form never offers this; a hand-built request gets the reason.
        throw badRequest("Use Mark received to record money against a line.");
      }
      return json({ outcome: result.outcome, commissionId, version: result.version });
    }

    // ── 3.7.3 Mark received ───────────────────────────────────────────────
    if (op === "payment") {
      const { data, error } = await db.rpc("agent_record_commission_payment", {
        p_agent_id: agentId,
        p_commission_id: commissionId,
        p_expected_version: expectedVersion,
        p_status: readStatus(payload.status, PAYMENT_STATUSES),
        p_received_cents: readCents(payload.receivedCents, "Amount received"),
        p_fee_cents: readCents(payload.feeCents, "Processing fee"),
        p_received_at: readDate(payload.receivedAt, "Received on"),
        ...audit,
      } as never);
      if (error) throw new Error(`commission payment failed: ${error.message}`);

      const result = first<{ outcome: string; version: number; gap_cents: string | null }>(data);
      if (!result || result.outcome === "not_found") throw notFound("No such commission line.");
      if (result.outcome === "stale") {
        throw conflict("This line changed since you opened it. Reload and try again.");
      }
      return json({
        outcome: result.outcome,
        commissionId,
        version: result.version,
        gapCents: result.gap_cents,
      });
    }

    // ── 3.7.3 Remove ──────────────────────────────────────────────────────
    const { data, error } = await db.rpc("agent_remove_commission", {
      p_agent_id: agentId,
      p_commission_id: commissionId,
      p_expected_version: expectedVersion,
      ...audit,
    } as never);
    if (error) throw new Error(`commission remove failed: ${error.message}`);

    const result = first<{ outcome: string; version: number }>(data);
    if (!result || result.outcome === "not_found") throw notFound("No such commission line.");
    if (result.outcome === "stale") {
      throw conflict("This line changed since you opened it. Reload and try again.");
    }
    return json({ outcome: result.outcome, commissionId, version: result.version });
  } catch (err) {
    return problem(err);
  }
});
