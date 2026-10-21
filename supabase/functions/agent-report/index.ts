/**
 * §3.11 Reporting's export door (P1). Each report's Export button downloads that report's own
 * table as CSV, for the period on screen (§3.11, ruled 2026-10-21).
 *
 * ── THE AUDIT ROW IS NOT WRITTEN HERE ──────────────────────────────────────────
 *
 * `agent_report_export` writes it in the same SQL call that returns the rows, so no file leaves
 * without its record (Data-Model §18.3), the shape `agent-commission`'s export set. This route
 * supplies the row's v7 id, the actor, and the caller's ip and user agent, and shapes the CSV.
 *
 * Reads for the SCREEN do not come through here: they are the `agent_report_*` definer
 * functions, called with the advisor's own token. Only the audited download needs the service
 * role, because only it writes.
 */
import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { badRequest, notFound, problem } from "../_shared/problem.ts";
import { uuidV7 } from "../_shared/uuid.ts";
import { readJson } from "../_shared/trip.ts";
import { agentDb, requireAgentId } from "../_shared/agent.ts";
import {
  readBasis,
  readReport,
  readReportPeriod,
  type ReportExport,
  reportCsv,
  reportFileName,
} from "../_shared/report.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
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

    if (payload.op !== "export") throw badRequest("op must be: export.");
    const report = readReport(payload.report);
    const period = readReportPeriod(report, payload.period);
    const basis = readBasis(report, payload.basis);

    const { data, error } = await db.rpc("agent_report_export", {
      p_agent_id: agentId,
      p_actor_user_id: ctx.platformUserId,
      p_report: report,
      p_period: period,
      p_basis: basis,
      p_audit_id: uuidV7(),
      p_ip: ctx.ip,
      p_user_agent: ctx.userAgent,
    } as never);
    if (error) throw new Error(`report export failed: ${error.message}`);

    // NULL: the advisor is archived (requireAgentId should have caught it first).
    if (data === null) throw notFound("That advisor cannot export.");
    const out = data as ReportExport;
    if (!out || !Array.isArray(out.rows)) throw new Error("export did not return rows");

    return json({
      outcome: "exported",
      rowCount: out.rows.length,
      csv: reportCsv(report, basis, out.rows),
      // The advisor's own date names a file with no period, never the server's UTC day.
      fileName: reportFileName(report, basis, out.from, out.to, out.today ?? undefined),
    });
  } catch (err) {
    return problem(err);
  }
});
