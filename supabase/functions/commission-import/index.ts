/**
 * Importing and reconciling an Inteletravel statement. Screens 3.7.5 (upload, map) and
 * 3.7.6 (resolve each row, mark as reconciled, or discard).
 *
 * ── THE LEDGER CHANGES IN ONE PLACE ───────────────────────────────────────────
 *
 * `upload`, `map`, `resolve` and `discard` change only the statement and its rows.
 * `reconcile` is the one op that writes `commission`, and it does every line in ONE SQL
 * transaction with an audit row per line (`agent_reconcile_commission_import`). This route
 * supplies 1,001 v7 audit ids for it — the row cap plus one for the statement — rather than
 * counting first, which would be a second read racing the decisions it counted.
 *
 * ── THE FILE ───────────────────────────────────────────────────────────────────
 *
 * Arrives as base64 in JSON (the web's server action reads the upload and forwards it), is
 * checked and read HERE (`_shared/statement.ts`), and is stored in the private
 * `commission-statements` bucket under a key this route derives from ids it trusts — the
 * client never names a storage path. If the SQL write then refuses (a duplicate) or fails,
 * the stored object is removed again, best effort.
 *
 * ── ONLY `stale` IS A 409 ──────────────────────────────────────────────────────
 *
 * As in `agent-commission`: the optimistic-lock failure is a 409 the web reads as
 * `conflict`; every outcome a screen should explain comes back 200 with an `outcome`.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, conflict, notFound, problem } from "../_shared/problem.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId, requireExpectedVersion } from "../_shared/agent.ts";
import { readDate, readId, readRate, requireCents } from "../_shared/commission.ts";
import {
  type ColumnMap,
  decodeStatement,
  guessColumnMap,
  MAX_ROWS,
  parseRows,
  readColumnMap,
  readFileBase64,
  readFilename,
  readStatementFile,
  toHex,
} from "../_shared/statement.ts";

const BUCKET = "commission-statements";

const OPS = ["upload", "map", "resolve", "reconcile", "discard"] as const;
type Op = (typeof OPS)[number];

const ACTIONS = ["confirm", "match", "create", "ignore"] as const;
type Action = (typeof ACTIONS)[number];

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

function requireAction(value: unknown): Action {
  if (typeof value !== "string" || !ACTIONS.includes(value as Action)) {
    throw badRequest(`action must be one of: ${ACTIONS.join(", ")}.`);
  }
  return value as Action;
}

function first<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

/** Outcomes each op may return as a 200, besides stale (409) and not_found (404). */
const MAP_OUTCOMES = new Set(["mapped", "not_open"]);
const RESOLVE_OUTCOMES = new Set([
  "resolved", "not_open", "not_allowed", "line_unavailable", "trip_not_found", "supplier_not_found",
]);
const RECONCILE_OUTCOMES = new Set(["reconciled", "needs_decisions", "not_open"]);
const DISCARD_OUTCOMES = new Set(["discarded", "not_open"]);

const STALE = "This statement changed since you opened it. Reload and try again.";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw badRequest("Use POST.");

    const ctx = await requireUser(req);
    // The service role, as every agent route runs (see `agentDb`): the import tables and the
    // bucket have no client-role grants, so every ownership test here is explicit.
    const db = agentDb();
    const agentId = await requireAgentId(ctx, db);
    const payload = await readJson(req);
    const op = requireOp(payload.op);

    const audit = { p_ip: ctx.ip, p_user_agent: ctx.userAgent };

    // ── 3.7.5 Upload ──────────────────────────────────────────────────────
    if (op === "upload") {
      const filename = readFilename(payload.filename);
      const bytes = readFileBase64(payload.fileBase64);
      const file = readStatementFile(decodeStatement(bytes));
      const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const checksumHex = `\\x${toHex(checksum)}`;

      // The same file again is answered before anything is stored. The SQL write checks again
      // (two uploads racing), and removes nothing it did not have to.
      const { data: dup, error: dupError } = await db
        .from("commission_import")
        .select("id, created_at")
        .eq("agent_id", agentId)
        .eq("checksum_sha256", checksumHex)
        .neq("status", "discarded")
        .maybeSingle();
      if (dupError) throw new Error(`duplicate check failed: ${dupError.message}`);
      if (dup) return json({ outcome: "duplicate_file", importId: dup.id, uploadedAt: dup.created_at });

      // The map guessed from the advisor's last statement first: next month's file, with the
      // same headers, maps itself.
      const { data: prev, error: prevError } = await db
        .from("commission_import")
        .select("headers, column_map")
        .eq("agent_id", agentId)
        .in("status", ["review", "reconciled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prevError) throw new Error(`previous statement read failed: ${prevError.message}`);
      const guess = guessColumnMap(
        file.headers,
        prev ? { headers: prev.headers ?? [], columnMap: (prev.column_map ?? {}) as ColumnMap } : null,
      );

      const importId = uuidV7();
      const documentId = uuidV7();
      const key = `${agentId}/${importId}.csv`;

      const { error: storeError } = await db.storage
        .from(BUCKET)
        .upload(key, bytes, { contentType: "text/csv", upsert: false });
      if (storeError) throw new Error(`statement store failed: ${storeError.message}`);

      const removeStored = async () => {
        const { error } = await db.storage.from(BUCKET).remove([key]);
        if (error) console.error(`orphaned statement object ${key}: ${error.message}`);
      };

      const { data, error } = await db.rpc("agent_upload_commission_statement", {
        p_agent_id: agentId,
        p_actor_user_id: ctx.platformUserId,
        p_import_id: importId,
        p_document_id: documentId,
        p_filename: filename,
        p_size_bytes: bytes.length,
        p_checksum: checksumHex,
        p_storage_key: key,
        p_headers: file.headers,
        p_column_map: guess,
        p_rows: file.rows.map((cells) => ({ id: uuidV7(), cells })),
        p_audit_id: uuidV7(),
        ...audit,
      } as never);
      if (error) {
        await removeStored();
        throw new Error(`statement upload failed: ${error.message}`);
      }

      const result = first<{ outcome: string; import_id: string; uploaded_at: string }>(data);
      if (!result) {
        await removeStored();
        throw notFound("Your account isn't set up to import statements.");
      }
      if (result.outcome === "duplicate_file") {
        await removeStored();
        return json({ outcome: "duplicate_file", importId: result.import_id, uploadedAt: result.uploaded_at });
      }
      if (result.outcome !== "uploaded") throw new Error(`unknown upload outcome: ${result.outcome}`);
      return json({ outcome: "uploaded", importId, rowCount: file.rows.length });
    }

    // Everything below names one statement at the version the screen rendered.
    const importId = readId(payload.importId, "statement");
    const expectedVersion = requireExpectedVersion(payload.expectedVersion);

    // ── 3.7.5 Map ─────────────────────────────────────────────────────────
    if (op === "map") {
      const { data: imp, error: impError } = await db
        .from("commission_import")
        .select("headers, total_rows")
        .eq("id", importId)
        .eq("agent_id", agentId)
        .neq("status", "discarded")
        .maybeSingle();
      if (impError) throw new Error(`statement read failed: ${impError.message}`);
      if (!imp) throw notFound("No such statement.");

      const headers = imp.headers ?? [];
      const columnMap = readColumnMap(payload.columnMap, headers.length);
      const statementDate = payload.statementDate === undefined || payload.statementDate === null ||
          payload.statementDate === ""
        ? null
        : readDate(payload.statementDate, "Statement date");
      if (columnMap.paid_on === undefined && statementDate === null) {
        throw badRequest("Choose the paid-on column, or enter the date the statement paid.");
      }

      // At most MAX_ROWS (the table's CHECK), which is also PostgREST's max_rows: one page.
      const { data: rows, error: rowsError } = await db
        .from("commission_import_row")
        .select("id, cells")
        .eq("import_id", importId)
        .order("row_number")
        .range(0, MAX_ROWS - 1);
      if (rowsError) throw new Error(`statement rows read failed: ${rowsError.message}`);
      if ((rows ?? []).length !== imp.total_rows) throw new Error("statement rows did not all come back");

      const parsed = parseRows((rows ?? []).map((r) => r.cells ?? []), columnMap, statementDate);
      const { data, error } = await db.rpc("agent_map_commission_import", {
        p_agent_id: agentId,
        p_import_id: importId,
        p_expected_version: expectedVersion,
        p_column_map: columnMap,
        p_statement_date: statementDate,
        p_rows: parsed.map((p, i) => ({ id: rows![i].id, ...p })),
      } as never);
      if (error) throw new Error(`statement map failed: ${error.message}`);

      const result = first<{ outcome: string; version: number }>(data);
      if (!result || result.outcome === "not_found") throw notFound("No such statement.");
      if (result.outcome === "stale") throw conflict(STALE);
      if (!MAP_OUTCOMES.has(result.outcome)) throw new Error(`unknown map outcome: ${result.outcome}`);
      return json({ outcome: result.outcome, importId, version: result.version });
    }

    // ── 3.7.6 Resolve one row ─────────────────────────────────────────────
    if (op === "resolve") {
      const action = requireAction(payload.action);
      const args: Record<string, unknown> = {
        p_agent_id: agentId,
        p_import_id: importId,
        p_expected_version: expectedVersion,
        p_row_id: readId(payload.rowId, "statement row"),
        p_action: action,
      };
      if (action === "match") args.p_commission_id = readId(payload.commissionId, "commission line");
      if (action === "create") {
        args.p_trip_id = readId(payload.tripId, "trip");
        args.p_supplier_id = readId(payload.supplierId, "supplier");
        args.p_gross_cents = requireCents(payload.grossCents, "Gross");
        args.p_commission_pct = readRate(payload.commissionPct);
        // v7, minted when the advisor decides, so the line's id is known before it exists.
        args.p_new_commission_id = uuidV7();
      }

      const { data, error } = await db.rpc("agent_resolve_commission_import_row", args as never);
      if (error) throw new Error(`statement row resolve failed: ${error.message}`);

      const result = first<{ outcome: string; version: number }>(data);
      if (!result || result.outcome === "not_found") throw notFound("No such statement row.");
      if (result.outcome === "stale") throw conflict(STALE);
      if (!RESOLVE_OUTCOMES.has(result.outcome)) throw new Error(`unknown resolve outcome: ${result.outcome}`);
      return json({ outcome: result.outcome, importId, version: result.version });
    }

    // ── 3.7.6 Mark as reconciled ──────────────────────────────────────────
    if (op === "reconcile") {
      const { data, error } = await db.rpc("agent_reconcile_commission_import", {
        p_agent_id: agentId,
        p_actor_user_id: ctx.platformUserId,
        p_import_id: importId,
        p_expected_version: expectedVersion,
        p_audit_ids: Array.from({ length: MAX_ROWS + 1 }, () => uuidV7()),
        ...audit,
      } as never);
      if (error) throw new Error(`statement reconcile failed: ${error.message}`);

      const result = first<{
        outcome: string;
        version: number;
        paid_count: number;
        created_count: number;
        already_count: number;
        blocking_count: number;
      }>(data);
      if (!result || result.outcome === "not_found") throw notFound("No such statement.");
      if (result.outcome === "stale") throw conflict(STALE);
      if (!RECONCILE_OUTCOMES.has(result.outcome)) throw new Error(`unknown reconcile outcome: ${result.outcome}`);
      return json({
        outcome: result.outcome,
        importId,
        version: result.version,
        paid: result.paid_count,
        created: result.created_count,
        alreadyRecorded: result.already_count,
        blocking: result.blocking_count,
      });
    }

    // ── 3.7.6 Discard ─────────────────────────────────────────────────────
    if (op !== "discard") throw new Error(`unhandled op: ${op satisfies never}`);
    const { data, error } = await db.rpc("agent_discard_commission_import", {
      p_agent_id: agentId,
      p_actor_user_id: ctx.platformUserId,
      p_import_id: importId,
      p_expected_version: expectedVersion,
      p_audit_id: uuidV7(),
      ...audit,
    } as never);
    if (error) throw new Error(`statement discard failed: ${error.message}`);

    const result = first<{ outcome: string; version: number }>(data);
    if (!result || result.outcome === "not_found") throw notFound("No such statement.");
    if (result.outcome === "stale") throw conflict(STALE);
    if (!DISCARD_OUTCOMES.has(result.outcome)) throw new Error(`unknown discard outcome: ${result.outcome}`);

    // A discarded statement's file goes too: it names every traveler on it, and nothing reads
    // it again. The document row stays, archived, as the record that it existed. Best effort:
    // the discard has already happened, and a leftover object is logged, not shown.
    if (result.outcome === "discarded") {
      const { error: removeError } = await db.storage.from(BUCKET).remove([`${agentId}/${importId}.csv`]);
      if (removeError) console.error(`discarded statement object not removed: ${removeError.message}`);
    }
    return json({ outcome: result.outcome, importId, version: result.version });
  } catch (err) {
    return problem(err);
  }
});
