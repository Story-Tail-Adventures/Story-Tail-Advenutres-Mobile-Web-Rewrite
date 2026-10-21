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
export const REPORTS = ["revenue", "suppliers", "destinations"] as const;
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

/** What `agent_report_export` returns. */
export type ReportExport = { from: string; to: string; rows: unknown[] };

/** Matches the screen's label for the NULL row. */
export const NO_DESTINATION = "No destination yet";

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

/** "revenue-booked-2026-01-01-to-2026-10-21.csv": the period the file covers, in its name. */
export function reportFileName(report: Report, basis: Basis | null, from: string, to: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(from) || !iso.test(to)) throw new Error("export period is not two dates");
  return `${report}${basis ? `-${basis}` : ""}-${from}-to-${to}.csv`;
}
