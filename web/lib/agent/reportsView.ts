import type {
  AgentReportClientRow,
  AgentReportDestinationRow,
  AgentReportFunnelRow,
  AgentReportPipelineMonthRow,
  AgentReportPipelineStageRow,
  AgentReportRevenueRow,
  AgentReportSupplierRow,
} from "@/lib/agent/api";
import { EMPTY_LEDGER_QUERY, ledgerHref } from "@/lib/agent/commissionFilters";
import type { ForecastStageView } from "@/lib/agent/forecast";
import { forecastTripCount } from "@/lib/agent/content";
import { isForecastStage, STAGE_LABEL } from "@/lib/agent/forecastWeights";
import {
  funnelBookDays,
  funnelStopped,
  funnelSummary,
  pipelineBucketTrips,
  pipelineOpenSub,
  REPORTS_COPY,
  REPORT_TILES,
  reportChangeVsLastYear,
} from "@/lib/agent/reportsCopy";
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

/** The reports built so far. The hub shows the rest as "On its way". */
export const BUILT_REPORTS: readonly ReportId[] = ["revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"];

/** The reports with a per-report Export. */
export type ExportableReport = "revenue" | "suppliers" | "destinations" | "clients" | "funnel" | "pipeline";

/** Reports that are not over a period: lifetime value, and today's pipeline. */
const NO_PERIOD: readonly ExportableReport[] = ["clients", "pipeline"];

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
export function reportExportHref(report: ExportableReport, period: ReportPeriod | null, basis?: RevenueBasis): string {
  const qs = new URLSearchParams({ report });
  // Lifetime value is lifetime and the pipeline is today: no period on their files.
  if (!NO_PERIOD.includes(report) && period) qs.set("period", period);
  if (report === "revenue") qs.set("basis", basis ?? "booked");
  return `/agent/reports/download?${qs.toString()}`;
}

/** "2025-q1" in the URL, or "none" for before tracking; anything else is "all". */
export function readCohort(value: Param): string | null {
  const v = one(value);
  return v && /^(\d{4}-q[1-4]|none)$/.test(v) ? v : null;
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
// 3.11.5 Client Lifetime Value
// ─────────────────────────────────────────────────────────────────────────────

/** "2025-q1" from "2025-01-01"; "none" for NULL (before tracking). */
function cohortKey(iso: string | null): string {
  if (!iso) return "none";
  return `${iso.slice(0, 4)}-q${(Number(iso.slice(5, 7)) + 2) / 3}`;
}

/** "2025 Q1", or "Before tracking". Matches the CSV's `cohortLabel`. */
export function cohortName(iso: string | null): string {
  if (!iso) return REPORTS_COPY.noCohort;
  return `${iso.slice(0, 4)} Q${(Number(iso.slice(5, 7)) + 2) / 3}`;
}

export type ClientLine = {
  clientId: string;
  rank: number;
  name: string;
  href: string;
  tripsLabel: string;
  valueLabel: string;
  commissionLabel: string;
  cohortLabel: string;
};

export type CohortChip = { key: string | null; label: string; href: string; selected: boolean };

export type ClientReport = {
  rows: ClientLine[];
  cohorts: CohortChip[];
  /** The book has no ranked client at all (as opposed to an empty cohort). */
  empty: boolean;
};

export function clientReport(rows: AgentReportClientRow[], cohort: string | null): ClientReport {
  // Rank is over the whole book, so filtering to a cohort keeps each client's true rank.
  const ranked = rows.map((r, i) => ({ r, rank: i + 1, key: cohortKey(r.cohort_start) }));

  // Newest cohort first, "before tracking" last.
  const keys = [...new Map(ranked.map((x) => [x.key, x.r.cohort_start])).entries()].sort(([a], [b]) =>
    a === "none" ? 1 : b === "none" ? -1 : b.localeCompare(a),
  );
  const href = (key: string | null) => (key ? `${reportHref("clients")}?cohort=${key}` : reportHref("clients"));

  return {
    rows: ranked
      .filter((x) => cohort === null || x.key === cohort)
      .map(({ r, rank }) => ({
        clientId: r.client_id,
        rank,
        name: r.display_name,
        href: `/agent/clients/${r.client_id}`,
        tripsLabel: String(r.trip_count),
        valueLabel: usd(cents(r.value_cents)),
        commissionLabel: usd(cents(r.commission_cents)),
        cohortLabel: cohortName(r.cohort_start),
      })),
    cohorts: [
      { key: null, label: REPORTS_COPY.cohortAll, href: href(null), selected: cohort === null },
      ...keys.map(([key, iso]) => ({ key, label: cohortName(iso), href: href(key), selected: key === cohort })),
    ],
    empty: rows.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.11.6 Conversion Funnel
// ─────────────────────────────────────────────────────────────────────────────

export type FunnelStage = {
  stage: number;
  label: string;
  reached: number;
  reachedLabel: string;
  /** Of the inquiries, for the bar and its caption. */
  pctOfTop: number;
  pctLabel: string;
  openHere: number;
  cancelledHere: number;
  /** "−22 · 15 still open, 7 cancelled", or null when nobody stopped here. */
  stoppedLabel: string | null;
};

export type FunnelReport = {
  stages: FunnelStage[];
  summary: string;
  /** "18.4 days on average…", or the sentence for none yet. */
  bookDaysLabel: string;
  empty: boolean;
};

const PCT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function funnelReport(rows: AgentReportFunnelRow[]): FunnelReport {
  const byStage = new Map(rows.map((r) => [r.stage, r]));
  const top = byStage.get(1)?.reached ?? 0;
  const stages = REPORTS_COPY.funnelStages.map((label, i) => {
    const r = byStage.get(i + 1);
    const reached = r?.reached ?? 0;
    const pct = top > 0 ? (reached / top) * 100 : 0;
    return {
      stage: i + 1,
      label,
      reached,
      reachedLabel: String(reached),
      pctOfTop: pct,
      pctLabel: `${PCT.format(pct)}%`,
      openHere: r?.open_here ?? 0,
      cancelledHere: r?.cancelled_here ?? 0,
      // The last stage is the end of the road, not a stop.
      stoppedLabel: i < 3 ? funnelStopped(r?.open_here ?? 0, r?.cancelled_here ?? 0) : null,
    };
  });

  const traveled = stages[3].reached;
  const days = rows[0]?.book_days_avg;
  const n = rows[0]?.book_days_n ?? 0;
  const daysNum = days === null || days === undefined ? null : Number(days);

  return {
    stages,
    summary: funnelSummary(top, traveled, top > 0 ? `${PCT.format((traveled / top) * 100)}%` : null),
    bookDaysLabel: daysNum === null || !Number.isFinite(daysNum) || n === 0
      ? REPORTS_COPY.bookDaysNone
      : funnelBookDays(daysNum.toFixed(1), n),
    empty: top === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.11.7 Pipeline Value
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineMonth = {
  key: string;
  label: string;
  amountLabel: string;
  barPct: number;
  /** The `later` and `undated` rows, drawn apart from the months. */
  extra: boolean;
};

export type PipelineReport = {
  grossLabel: string;
  weightedLabel: string;
  openSub: string;
  /** The weights card's rows: rawCents is GROSS value here (it is commission on §3.7.7). */
  stages: ForecastStageView[];
  months: PipelineMonth[];
  empty: boolean;
};

const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", year: "numeric" });

export function pipelineReport(
  stageRows: AgentReportPipelineStageRow[],
  monthRows: AgentReportPipelineMonthRow[],
): PipelineReport {
  const gross = stageRows[0] ? cents(stageRows[0].total_gross_cents) : 0;
  const weighted = stageRows[0] ? cents(stageRows[0].total_weighted_cents) : 0;
  const trips = stageRows.reduce((n, s) => n + s.trip_count, 0);

  // The twelve months always; `past`, `later` and `undated` only when they hold a trip. A
  // bucket this file does not know is dropped rather than drawn as a month it is not.
  const EXTRA: Record<string, string> = {
    past: REPORTS_COPY.pastStart,
    later: REPORTS_COPY.later,
    undated: REPORTS_COPY.undated,
  };
  const shown = monthRows.filter((r) => r.bucket === "month" || (r.bucket in EXTRA && r.trip_count > 0));
  // Bars are scaled against the MONTHS only: the extra rows draw no bar, and a large undated
  // figure would otherwise shrink every month to a sliver.
  const max = Math.max(1, ...shown.filter((r) => r.bucket === "month").map((r) => cents(r.weighted_cents)));
  let first = true;

  return {
    grossLabel: usd(gross),
    weightedLabel: usd(weighted),
    openSub: pipelineOpenSub(trips),
    stages: stageRows.flatMap((s) => {
      if (!isForecastStage(s.status)) return [];
      return [{
        stage: s.status,
        label: STAGE_LABEL[s.status],
        weightPct: s.weight_pct,
        tripCount: s.trip_count,
        tripCountLabel: forecastTripCount(s.trip_count),
        rawCents: cents(s.gross_cents),
        weightedLabel: usd(cents(s.weighted_cents)),
      }];
    }),
    months: shown.map((r) => {
      const amount = cents(r.weighted_cents);
      let label: string;
      if (r.bucket === "month" && r.month_start) {
        const d = dateOf(r.month_start);
        // The year only where it turns: the first month and every January.
        label = (first || d.getUTCMonth() === 0 ? MONTH_YEAR : MONTH_SHORT).format(d);
        first = false;
      } else {
        label = pipelineBucketTrips(EXTRA[r.bucket], r.trip_count);
      }
      return {
        key: r.bucket === "month" ? (r.month_start ?? r.bucket) : r.bucket,
        label,
        amountLabel: usd(amount),
        barPct: r.bucket === "month" && amount > 0 ? Math.max(2, Math.min(100, Math.round((amount / max) * 100))) : 0,
        extra: r.bucket !== "month",
      };
    }),
    empty: trips === 0,
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
