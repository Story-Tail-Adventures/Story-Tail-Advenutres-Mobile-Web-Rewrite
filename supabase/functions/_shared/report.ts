/**
 * §3.11 Reporting: the request checks and the CSV for each report's own Export (P1).
 *
 * Each report's Export downloads that report's table, for the period on screen, and is audited
 * (§3.11, ruled 2026-10-21). `agent_report_export` returns the screen's own rows (it calls the
 * same SQL the screen reads), so the file and the screen cannot disagree. This file only checks
 * the request and shapes the CSV.
 *
 * Cells go through `csvCell` (RFC 4180 quoting and the formula-injection guard) and money through
 * `centsToDecimal` (exact, never a float), the ledger export's own helpers.
 */
import { badRequest } from "./problem.ts";
import { centsToDecimal, csvCell } from "./commission.ts";

/** The reports with an Export today. PR 3 (§3.11.8) adds the Export Center's types. */
export const REPORTS = ["revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"] as const;
export type Report = (typeof REPORTS)[number];

/** §3.11's one period filter, as `report_period_bounds()` spells it. */
export const PERIODS = ["ytd", "12mo", "qtd"] as const;
export type Period = (typeof PERIODS)[number];

/** Revenue by Month's two views. */
export const BASES = ["booked", "received"] as const;
export type Basis = (typeof BASES)[number];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${what} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function readReport(value: unknown): Report {
  return oneOf(value, REPORTS, "report");
}

export function readPeriod(value: unknown): Period {
  return oneOf(value, PERIODS, "period");
}

/**
 * Lifetime value is lifetime and the pipeline is today: neither takes a period, and one sent
 * is refused rather than silently ignored. Every other report requires one.
 */
export function readReportPeriod(report: Report, value: unknown): Period | null {
  if (report === "clients" || report === "pipeline") {
    if (value !== undefined && value !== null) throw badRequest("This report takes no period.");
    return null;
  }
  return readPeriod(value);
}

/** Required for revenue, and refused for anything else rather than silently ignored. */
export function readBasis(report: Report, value: unknown): Basis | null {
  if (report !== "revenue") {
    if (value !== undefined && value !== null) throw badRequest("basis is only for revenue.");
    return null;
  }
  return oneOf(value, BASES, "basis");
}

export type RevenueRow = {
  month_start: string;
  cents: string;
  item_count: number;
  prior_cents: string | null;
};

export type SupplierRow = {
  supplier_name: string;
  received_cents: string;
  owed_cents: string;
  line_count: number;
  set_aside_count: number;
  set_aside_received_cents: string;
};

export type DestinationRow = {
  destination: string | null;
  trip_count: number;
  value_cents: string;
};

export type ClientRow = {
  display_name: string;
  trip_count: number;
  value_cents: string;
  commission_cents: string;
  cohort_start: string | null;
};

/** Pipeline rows come tagged: `stage` rows first, then `month` / `later` / `undated`. */
export type PipelineRow =
  | { kind: "stage"; status: string; weight_pct: number; trip_count: number; gross_cents: string; weighted_cents: string }
  | { kind: "past" | "month" | "later" | "undated"; month_start: string | null; trip_count: number; weighted_cents: string };

/** The stage names the screen uses (§3.7.7's labels). */
const PIPELINE_STAGES: Record<string, string> = {
  inquiry: "Inquiry",
  proposal: "Proposal",
  booked: "Booked",
  in_progress: "Traveling",
};

export type FunnelRow = {
  stage: number;
  reached: number;
  open_here: number;
  cancelled_here: number;
  book_days_avg: number | string | null;
  book_days_n: number;
};

/**
 * What `agent_report_export` returns. `from`/`to` are null for lifetime value and the pipeline;
 * `today` is the advisor's own date, which names those files.
 */
export type ReportExport = { from: string | null; to: string | null; today?: string | null; rows: unknown[] };

/** Matches the screen's label for the NULL row. */
export const NO_DESTINATION = "No destination yet";

/** Matches the screen's label for a client committed before tracking began. */
export const NO_COHORT = "Before tracking";

/** The funnel's stages, 1 to 4, as the screen names them. */
export const FUNNEL_STAGES = ["Inquiry", "Proposal", "Booked", "Traveled"] as const;

/** "2025 Q1" from "2025-01-01". */
export function cohortLabel(iso: string | null): string {
  if (iso === null) return NO_COHORT;
  if (!/^\d{4}-(01|04|07|10)-01$/.test(iso)) throw new Error(`not a quarter start: ${iso}`);
  return `${iso.slice(0, 4)} Q${(Number(iso.slice(5, 7)) + 2) / 3}`;
}

function line(cells: string[]): string {
  return cells.join(",");
}

/** "2026-10" from "2026-10-01": a month is data in a sheet, not a sentence. */
function month(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`not a date: ${iso}`);
  return iso.slice(0, 7);
}

function count(n: unknown): string {
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new Error(`not a count: ${String(n)}`);
  }
  return String(n);
}

/**
 * The CSV for one report. CRLF line ends and a trailing one, per RFC 4180, as the ledger's.
 * Throws on a row of the wrong shape: a malformed file is worse than a failed download.
 */
export function reportCsv(report: Report, basis: Basis | null, rows: unknown[]): string {
  const lines: string[] = [];

  if (report === "revenue") {
    const booked = basis === "booked";
    lines.push(line([
      csvCell("Month"),
      csvCell(booked ? "Booked value" : "Commission received"),
      csvCell(booked ? "Trips" : "Commission payments"),
      csvCell("Same month last year"),
    ]));
    for (const r of rows as RevenueRow[]) {
      lines.push(line([
        csvCell(month(r.month_start), false),
        csvCell(centsToDecimal(r.cents), false),
        csvCell(count(r.item_count), false),
        // Empty, not 0.00: nothing was recorded that month a year ago, which is not zero.
        csvCell(r.prior_cents === null ? null : centsToDecimal(r.prior_cents), false),
      ]));
    }
  } else if (report === "suppliers") {
    lines.push(line([
      csvCell("Supplier"),
      csvCell("Received"),
      csvCell("Still owed"),
      csvCell("Commission lines"),
      csvCell("Set aside (disputed or lost)"),
      csvCell("Already received on set-aside lines"),
    ]));
    for (const r of rows as SupplierRow[]) {
      lines.push(line([
        csvCell(r.supplier_name),
        csvCell(centsToDecimal(r.received_cents), false),
        csvCell(centsToDecimal(r.owed_cents), false),
        csvCell(count(r.line_count), false),
        csvCell(count(r.set_aside_count), false),
        csvCell(centsToDecimal(r.set_aside_received_cents), false),
      ]));
    }
  } else if (report === "clients") {
    lines.push(line([
      csvCell("Rank"),
      csvCell("Client"),
      csvCell("Trips"),
      csvCell("Lifetime value"),
      csvCell("Commission"),
      csvCell("Cohort"),
    ]));
    (rows as ClientRow[]).forEach((r, i) => {
      lines.push(line([
        csvCell(String(i + 1), false),
        csvCell(r.display_name),
        csvCell(count(r.trip_count), false),
        csvCell(centsToDecimal(r.value_cents), false),
        csvCell(centsToDecimal(r.commission_cents), false),
        csvCell(cohortLabel(r.cohort_start)),
      ]));
    });
  } else if (report === "pipeline") {
    const all = rows as PipelineRow[];
    lines.push(line([csvCell("Stage"), csvCell("Trips"), csvCell("Full value"), csvCell("Weight %"), csvCell("Weighted")]));
    for (const r of all) {
      if (r.kind !== "stage") continue;
      const name = PIPELINE_STAGES[r.status];
      if (!name) throw new Error(`unknown pipeline stage: ${r.status}`);
      lines.push(line([
        csvCell(name),
        csvCell(count(r.trip_count), false),
        csvCell(centsToDecimal(r.gross_cents), false),
        csvCell(count(r.weight_pct), false),
        csvCell(centsToDecimal(r.weighted_cents), false),
      ]));
    }
    // The second table after a blank line: weighted value by the month trips start.
    lines.push("");
    lines.push(line([csvCell("Travel month"), csvCell("Trips"), csvCell("Weighted")]));
    for (const r of all) {
      if (r.kind === "stage") continue;
      const label = r.kind === "month"
        ? month(r.month_start ?? "")
        : r.kind === "past" ? "Start date passed"
        : r.kind === "later" ? "Later" : r.kind === "undated" ? "No travel dates yet" : null;
      if (label === null) throw new Error(`unknown pipeline bucket: ${(r as { kind: string }).kind}`);
      lines.push(line([
        csvCell(label, false),
        csvCell(count(r.trip_count), false),
        csvCell(centsToDecimal(r.weighted_cents), false),
      ]));
    }
  } else if (report === "funnel") {
    const stages = rows as FunnelRow[];
    lines.push(line([
      csvCell("Stage"),
      csvCell("Reached"),
      csvCell("Stopped here, still open"),
      csvCell("Stopped here, cancelled"),
    ]));
    for (const r of stages) {
      const name = FUNNEL_STAGES[r.stage - 1];
      if (!name) throw new Error(`unknown funnel stage: ${r.stage}`);
      lines.push(line([
        csvCell(name),
        csvCell(count(r.reached), false),
        csvCell(count(r.open_here), false),
        csvCell(count(r.cancelled_here), false),
      ]));
    }
    // Days to book is one figure for the whole cohort, after a blank line rather than
    // repeated down a column.
    // jsonb sends the numeric as a JSON number, so 18.0 arrives as 18: one decimal, always.
    const raw = stages[0]?.book_days_avg ?? null;
    const days = raw === null ? null : Number(raw);
    if (days !== null && !Number.isFinite(days)) throw new Error(`not a day count: ${raw}`);
    lines.push("");
    lines.push(line([
      csvCell("Average days from inquiry to booked"),
      csvCell(days === null ? null : days.toFixed(1), false),
    ]));
    lines.push(line([csvCell("Trips in that average"), csvCell(count(stages[0]?.book_days_n ?? 0), false)]));
  } else {
    lines.push(line([csvCell("Destination"), csvCell("Trips"), csvCell("Value")]));
    for (const r of rows as DestinationRow[]) {
      lines.push(line([
        csvCell(r.destination ?? NO_DESTINATION),
        csvCell(count(r.trip_count), false),
        csvCell(centsToDecimal(r.value_cents), false),
      ]));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * "revenue-booked-2026-01-01-to-2026-10-21.csv": the period the file covers, in its name.
 * Lifetime value has none: "clients-lifetime-value-2026-10-21.csv", dated the day it ran.
 */
export function reportFileName(
  report: Report,
  basis: Basis | null,
  from: string | null,
  to: string | null,
  today = new Date().toISOString().slice(0, 10),
): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (report === "clients" || report === "pipeline") {
    if (!iso.test(today)) throw new Error("export date is not a date");
    return report === "clients" ? `clients-lifetime-value-${today}.csv` : `pipeline-${today}.csv`;
  }
  if (!from || !to || !iso.test(from) || !iso.test(to)) throw new Error("export period is not two dates");
  return `${report}${basis ? `-${basis}` : ""}-${from}-to-${to}.csv`;
}
