import type {
  AgentReportDestinationRow,
  AgentReportRevenueRow,
  AgentReportSupplierRow,
} from "@/lib/agent/api";
import { EMPTY_LEDGER_QUERY, ledgerHref } from "@/lib/agent/commissionFilters";
import { REPORTS_COPY, REPORT_TILES, reportChangeVsLastYear } from "@/lib/agent/reportsCopy";
import { formatTripMoney } from "@/lib/trips/money";

/**
 * §3.11's view models: plain JSON-safe data out, every figure formatted here. Pure, so a
 * Server Component can import it and the tests can drive it; the loaders that read the
 * database are in `reports.ts`.
 *
 * Money is USD only (BRD §3, `trip_currency_usd`), so every amount is formatted as USD rather
 * than labelled from a currency column the reports do not return.
 */

// ─────────────────────────────────────────────────────────────────────────────
// The period and the URL
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_PERIODS = ["ytd", "12mo", "qtd"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REVENUE_BASES = ["booked", "received"] as const;
export type RevenueBasis = (typeof REVENUE_BASES)[number];

export type ReportId = (typeof REPORT_TILES)[number]["id"];

/** The reports PR 1 built. The hub shows the rest as "On its way". */
export const BUILT_REPORTS: readonly ReportId[] = ["revenue", "suppliers", "destinations"];

type Param = string | string[] | undefined;

function one(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Anything unknown is the default, never an error page: a URL is typed by people. */
export function readPeriod(value: Param): ReportPeriod {
  const v = one(value);
  return (REPORT_PERIODS as readonly string[]).includes(v ?? "") ? (v as ReportPeriod) : "ytd";
}

export function readBasis(value: Param): RevenueBasis {
  return one(value) === "received" ? "received" : "booked";
}

export function readCompare(value: Param): boolean {
  return one(value) === "1";
}

export const PERIOD_NAMES: Record<ReportPeriod, string> = {
  ytd: REPORTS_COPY.periodYtd,
  "12mo": REPORTS_COPY.period12mo,
  qtd: REPORTS_COPY.periodQtd,
};

export function reportHref(id: ReportId): string {
  return `/agent/reports/${id}`;
}

/** A report's own URL with its state. Defaults are left out, so the bare URL is canonical. */
export function reportStateHref(
  id: ReportId,
  state: { period: ReportPeriod; basis?: RevenueBasis; compare?: boolean },
): string {
  const qs = new URLSearchParams();
  if (state.period !== "ytd") qs.set("period", state.period);
  if (state.basis && state.basis !== "booked") qs.set("basis", state.basis);
  if (state.compare) qs.set("compare", "1");
  const q = qs.toString();
  return q ? `${reportHref(id)}?${q}` : reportHref(id);
}

/**
 * The CSV for the report on screen. A plain anchor's target (never next/link), because a GET
 * that writes an audit row must not be prefetched on hover.
 */
export function reportExportHref(report: "revenue" | "suppliers" | "destinations", period: ReportPeriod, basis?: RevenueBasis): string {
  const qs = new URLSearchParams({ report, period });
  if (report === "revenue") qs.set("basis", basis ?? "booked");
  return `/agent/reports/download?${qs.toString()}`;
}

export type PeriodChip = { period: ReportPeriod; label: string; href: string; selected: boolean };

export function periodChips(
  id: ReportId,
  current: ReportPeriod,
  keep: { basis?: RevenueBasis; compare?: boolean } = {},
): PeriodChip[] {
  return REPORT_PERIODS.map((p) => ({
    period: p,
    label: PERIOD_NAMES[p],
    href: reportStateHref(id, { period: p, ...keep }),
    selected: p === current,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

function cents(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whole dollars. A negative is formatted here rather than handed on: `formatMoney` throws on
 * one, and in a Server Component a throw is a 500, not a retry screen. The schema does not
 * forbid a negative trip total (a credit component), so a report must not fall over on it.
 */
function usd(value: number): string {
  if (value < 0) return `−${formatTripMoney(-value, "USD", { whole: true })}`;
  return formatTripMoney(value, "USD", { whole: true });
}

/** Read at noon UTC and formatted in UTC: a calendar date has no zone to be wrong in. */
function dateOf(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const SHORT_MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const LONG_MONTH = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });

/** "Jan 1 to Oct 21, 2026", or with both years when the window crosses one. */
export function periodRangeLabel(from: string, to: string): string {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${(sameYear ? SHORT_DAY : LONG_DAY).format(dateOf(from))} to ${LONG_DAY.format(dateOf(to))}`;
}

/** Whole-number percent change, or null when there is nothing to change from. */
function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** 0–100 against the largest value with headroom; anything above zero is at least 2. */
function heightPct(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / (max * 1.08)) * 100));
}

/** A share of a total, 0–100, at least 1 for anything above zero so it still draws. */
function sharePct(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0;
  return Math.max(1, Math.round((value / total) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.11.2 Revenue by Month
// ─────────────────────────────────────────────────────────────────────────────

export type RevenueMonth = {
  monthStart: string;
  /** "Oct", under the bar. */
  label: string;
  /** "October 2026", for the table and the bar's title. */
  longLabel: string;
  amountLabel: string;
  countLabel: string;
  heightPct: number;
  /** Null when that month a year back had nothing recorded. */
  priorLabel: string | null;
  priorHeightPct: number;
  isCurrent: boolean;
};

export type RevenueReport = {
  months: RevenueMonth[];
  totalLabel: string;
  empty: boolean;
  /** True once ANY month in the window has a figure a year back (§3.11's YoY rule). */
  hasPrior: boolean;
  /** "+22% vs last year" over the months that have a prior figure, or null. */
  change: string | null;
};

export function revenueReport(rows: AgentReportRevenueRow[], today: string): RevenueReport {
  const values = rows.map((r) => cents(r.cents));
  // `== null`, not `=== null`: a renamed column arrives as undefined, and treating that as a
  // real $0 last year would switch year over year on with a made-up comparison.
  const priors = rows.map((r) => (r.prior_cents == null ? null : cents(r.prior_cents)));
  // One scale for this year and last, so the two bars of a month compare honestly.
  const max = Math.max(0, ...values, ...priors.map((p) => p ?? 0));
  const currentMonth = `${today.slice(0, 7)}-01`;

  const hasPrior = priors.some((p) => p !== null);
  // Like for like: only the months that have a figure a year back are compared, so a window
  // whose earlier months predate any records cannot read as growth.
  let nowCompared = 0;
  let before = 0;
  rows.forEach((_, i) => {
    if (priors[i] !== null) {
      nowCompared += values[i];
      before += priors[i] as number;
    }
  });
  const pct = hasPrior ? percentChange(nowCompared, before) : null;

  return {
    months: rows.map((r, i) => ({
      monthStart: r.month_start,
      label: SHORT_MONTH.format(dateOf(r.month_start)),
      longLabel: LONG_MONTH.format(dateOf(r.month_start)),
      amountLabel: usd(values[i]),
      countLabel: String(r.item_count),
      heightPct: heightPct(values[i], max),
      priorLabel: priors[i] === null ? null : usd(priors[i] as number),
      priorHeightPct: heightPct(priors[i] ?? 0, max),
      isCurrent: r.month_start === currentMonth,
    })),
    totalLabel: usd(values.reduce((a, b) => a + b, 0)),
    empty: values.every((v) => v === 0),
    hasPrior,
    change: pct === null ? null : reportChangeVsLastYear(pct),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.11.3 Commission by Supplier
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierLine = {
  supplierId: string;
  name: string;
  /** The ledger, filtered to this supplier and the same travel dates. */
  href: string;
  receivedLabel: string;
  owedLabel: string;
  totalLabel: string;
  /** Of the period's received + owed, for the bar. */
  sharePct: number;
  shareLabel: string;
  /** The received part of this supplier's bar, as a percent of the bar. */
  receivedPct: number;
};

export type SupplierReport = {
  rows: SupplierLine[];
  receivedTotalLabel: string;
  owedTotalLabel: string;
  setAsideCount: number;
  /** Money that did arrive on disputed or lost lines; named in the footnote, summed nowhere. */
  setAsideReceivedLabel: string | null;
  empty: boolean;
};

export function supplierReport(
  rows: AgentReportSupplierRow[],
  period: { from: string; to: string },
): SupplierReport {
  // A supplier whose only lines are disputed or lost has no money to draw; it still feeds the
  // set-aside footnote.
  const shown = rows.filter((r) => cents(r.received_cents) + cents(r.owed_cents) > 0);
  const total = shown.reduce((a, r) => a + cents(r.received_cents) + cents(r.owed_cents), 0);

  return {
    rows: shown.map((r) => {
      const received = cents(r.received_cents);
      const owed = cents(r.owed_cents);
      const share = sharePct(received + owed, total);
      return {
        supplierId: r.supplier_id,
        name: r.supplier_name,
        href: ledgerHref({
          ...EMPTY_LEDGER_QUERY,
          supplierId: r.supplier_id,
          travelFrom: period.from,
          travelTo: period.to,
        }),
        receivedLabel: usd(received),
        owedLabel: usd(owed),
        totalLabel: usd(received + owed),
        sharePct: share,
        shareLabel: `${share}%`,
        receivedPct: received + owed > 0 ? Math.round((received / (received + owed)) * 100) : 0,
      };
    }),
    receivedTotalLabel: usd(shown.reduce((a, r) => a + cents(r.received_cents), 0)),
    owedTotalLabel: usd(shown.reduce((a, r) => a + cents(r.owed_cents), 0)),
    setAsideCount: rows.reduce((a, r) => a + r.set_aside_count, 0),
    setAsideReceivedLabel: (() => {
      const received = rows.reduce((a, r) => a + cents(r.set_aside_received_cents), 0);
      return received > 0 ? usd(received) : null;
    })(),
    empty: shown.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.11.4 Top Destinations
// ─────────────────────────────────────────────────────────────────────────────

export type DestinationLine = {
  name: string;
  /** The NULL row: trips with no stop yet. Drawn quieter, never dropped. */
  unnamed: boolean;
  tripsLabel: string;
  valueLabel: string;
  sharePct: number;
};

export type DestinationReport = {
  rows: DestinationLine[];
  totalLabel: string;
  empty: boolean;
};

export function destinationReport(rows: AgentReportDestinationRow[]): DestinationReport {
  // The SQL splits each trip's value across its stops in whole cents, so this sum is exactly
  // the trips' total; no stop is counted twice in money.
  const total = rows.reduce((a, r) => a + cents(r.value_cents), 0);
  const max = Math.max(0, ...rows.map((r) => cents(r.value_cents)));
  return {
    rows: rows.map((r) => ({
      name: r.destination ?? REPORTS_COPY.noDestination,
      unnamed: r.destination === null,
      tripsLabel: String(r.trip_count),
      valueLabel: usd(cents(r.value_cents)),
      // Against the leader, not the total: a ranking reads best when the top bar is full.
      sharePct: sharePct(cents(r.value_cents), max),
    })),
    totalLabel: usd(total),
    empty: rows.length === 0,
  };
}
