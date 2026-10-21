import {
  callAgentRead,
  type AgentReportDestinationRow,
  type AgentReportPeriodRow,
  type AgentReportRevenueRow,
  type AgentReportSupplierRow,
} from "@/lib/agent/api";
import {
  destinationReport,
  periodRangeLabel,
  revenueReport,
  supplierReport,
  type DestinationReport,
  type ReportPeriod,
  type RevenueBasis,
  type RevenueReport,
  type SupplierReport,
} from "@/lib/agent/reportsView";

/**
 * §3.11's loaders. Server only (they read the session cookie through `callAgentRead`); the
 * shaping is in `reportsView.ts`, which a client module may import and this file may not be.
 *
 * `null` from a loader means the READ failed, or the caller is not an advisor (no period row).
 * An advisor with nothing in the period gets a populated, empty report, never null: "$0" and
 * "couldn't load" are different answers.
 */

export type ReportWindow = { from: string; to: string; today: string; rangeLabel: string };

function windowOf(row: AgentReportPeriodRow | undefined): ReportWindow | null {
  if (!row) return null;
  return {
    from: row.from_date,
    to: row.to_date,
    today: row.today,
    rangeLabel: periodRangeLabel(row.from_date, row.to_date),
  };
}

export async function loadRevenue(
  period: ReportPeriod,
  basis: RevenueBasis,
): Promise<{ window: ReportWindow; report: RevenueReport } | null> {
  const [p, r] = await Promise.all([
    callAgentRead<AgentReportPeriodRow>("agent_report_period", { p_period: period }),
    callAgentRead<AgentReportRevenueRow>("agent_report_revenue_by_month", { p_period: period, p_basis: basis }),
  ]);
  if (!p.ok || !r.ok) return null;
  const window = windowOf(p.rows[0]);
  if (!window) return null;
  return { window, report: revenueReport(r.rows, window.today) };
}

export async function loadSupplierReport(
  period: ReportPeriod,
): Promise<{ window: ReportWindow; report: SupplierReport } | null> {
  const [p, r] = await Promise.all([
    callAgentRead<AgentReportPeriodRow>("agent_report_period", { p_period: period }),
    callAgentRead<AgentReportSupplierRow>("agent_report_commission_by_supplier", { p_period: period }),
  ]);
  if (!p.ok || !r.ok) return null;
  const window = windowOf(p.rows[0]);
  if (!window) return null;
  return { window, report: supplierReport(r.rows, window) };
}

export async function loadDestinationReport(
  period: ReportPeriod,
): Promise<{ window: ReportWindow; report: DestinationReport } | null> {
  const [p, r] = await Promise.all([
    callAgentRead<AgentReportPeriodRow>("agent_report_period", { p_period: period }),
    callAgentRead<AgentReportDestinationRow>("agent_report_top_destinations", { p_period: period }),
  ]);
  if (!p.ok || !r.ok) return null;
  const window = windowOf(p.rows[0]);
  if (!window) return null;
  return { window, report: destinationReport(r.rows) };
}
