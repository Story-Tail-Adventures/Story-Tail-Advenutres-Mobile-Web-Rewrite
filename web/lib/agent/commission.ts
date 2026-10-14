import type { KpiTileData } from "@/components/agent/KpiTile";
import {
  callAgentRead,
  type AgentCommissionDashboardRow,
  type AgentCommissionLedgerRow,
  type AgentCommissionLineRow,
  type AgentCommissionMonthRow,
  type AgentCommissionSummaryRow,
  type AgentCommissionSupplierRow,
  type AgentTripComponentRow,
  type AgentTripOverviewRow,
  type AgentTripRosterRow,
} from "@/lib/agent/api";
import {
  prefillBySupplier,
  type LineValues,
  type PaymentValues,
  type SupplierPrefill,
} from "@/lib/agent/commissionForm";
import { centsToDollars } from "@/lib/agent/payments";
import { loadSuppliers, type SupplierGroup } from "@/lib/agent/tripBuilder";
import {
  COMMISSION_STATUS_FILTERS,
  EMPTY_LEDGER_QUERY,
  ledgerHref,
  type CommissionStatus,
  type LedgerQuery,
} from "@/lib/agent/commissionFilters";
import {
  COMMISSION_COPY,
  commissionChangeVsLastYear,
  commissionDisputedCount,
  commissionExpectedOn,
  commissionLineHeading,
  commissionPaidLine,
  commissionRateChangeVsLastYear,
  commissionTermsLine,
  commissionTrendChange,
  commissionTripCount,
} from "@/lib/agent/content";
import { cents, money } from "@/lib/agent/queries";
import { formatTripMoney } from "@/lib/trips/money";

/**
 * §3.7.1 and §3.7.2's view models — siblings of `trips.ts` and `clients.ts`, built the same
 * way: plain JSON-safe data out, everything formatted here, and `null` from a loader means
 * the READ failed. An empty ledger is a populated object with `rows: []`.
 *
 * TWO NUMBERS ON PURPOSE. "Expected · 90d" is trip-grain (trip totals); every other figure
 * here is ledger-grain (commission lines). Nothing in this file adds one to the other.
 */

/** Matches `agent_commission_ledger`'s own default so the two cannot drift. */
export const LEDGER_PAGE_SIZE = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Shared formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PostgREST sends `numeric` as a JSON number, but a view or a future cast could send a
 * string, and `Number(null)` is 0 — which on a rate tile is a claim. Null stays null.
 */
function rate(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Whole-number percent change, or null when there is no base to change from. */
function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

const RATE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "12%", "12.5%". A rate is stored to two places; trailing zeros say nothing. */
export function rateLabel(pct: number | string): string {
  return `${RATE_FORMAT.format(Number(pct))}%`;
}

/**
 * "Aug 12, 2026" from a date-only ISO string. Read at noon UTC and formatted in UTC: the
 * value is a calendar date with no time in it, so there is no zone for it to be wrong in.
 */
export function travelDateLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function monthLabel(iso: string, style: "short" | "long"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: style,
    ...(style === "long" ? { year: "numeric" } : {}),
  }).format(new Date(`${iso}T12:00:00Z`));
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.7.1 Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export type CommissionMonth = {
  monthStart: string;
  /** "Jun", under the bar. */
  label: string;
  /** "June 2026", for the screen-reader table and the bar's title. */
  longLabel: string;
  amountLabel: string;
  /** 0–100, against the tallest bar with a little headroom. */
  heightPct: number;
  isCurrent: boolean;
};

export type CommissionDashboard = {
  tiles: KpiTileData[];
  months: CommissionMonth[];
  /** False when all twelve months are zero — the chart then says so in words. */
  anyReceived: boolean;
  /** "+24% vs prior year", or null when the prior twelve months had nothing to compare. */
  trendChange: string | null;
};

export function dashboardTiles(d: AgentCommissionDashboardRow): KpiTileData[] {
  const cur = d.currency;
  const ytd = cents(d.ytd_received_cents);
  const ly = cents(d.ly_received_cents);
  const ytdChange = percentChange(ytd, ly);

  const avg = rate(d.avg_rate_pct);
  const lyAvg = rate(d.ly_avg_rate_pct);

  return [
    {
      id: "ytd",
      label: COMMISSION_COPY.tileYtd,
      value: money(d.ytd_received_cents, cur),
      // Null rather than "+∞%" when last year had nothing in the same window.
      sub: ytdChange === null ? null : commissionChangeVsLastYear(ytdChange),
      unavailable: null,
      accent: "secondary",
      icon: "dollar",
    },
    {
      id: "upcoming",
      label: COMMISSION_COPY.tileUpcoming,
      value: money(d.upcoming_commission_cents, cur),
      sub: d.upcoming_trip_count > 0
        ? commissionTripCount(d.upcoming_trip_count)
        : COMMISSION_COPY.nothingUpcoming,
      unavailable: null,
      accent: "primary",
      icon: "calendar",
    },
    {
      id: "risk",
      label: COMMISSION_COPY.tileAtRisk,
      value: money(d.at_risk_cents, cur),
      sub: commissionDisputedCount(d.disputed_count),
      unavailable: null,
      accent: "surface",
      icon: "warning",
      // The one tile whose drill lands on exactly the LINES it sums — the disputed ones. Not
      // the same AMOUNTS: the tile is the unpaid gap and the ledger prints each line's full
      // expected figure (received and fee are §3.7.3's detail). The other tiles would land
      // on lists of different lines altogether, which is worse than no link.
      href: d.disputed_count > 0
        ? ledgerHref({ ...EMPTY_LEDGER_QUERY, statuses: ["disputed"] })
        : null,
    },
    {
      id: "rate",
      label: COMMISSION_COPY.tileRate,
      value: avg === null ? null : `${avg.toFixed(1)}%`,
      sub: avg !== null && lyAvg !== null
        ? commissionRateChangeVsLastYear(Math.round((avg - lyAvg) * 10) / 10)
        : null,
      unavailable: avg === null ? COMMISSION_COPY.rateUnavailable : null,
      accent: "tertiary",
      icon: "chart",
    },
  ];
}

export function dashboardMonths(rows: AgentCommissionMonthRow[], currency: string | null): CommissionMonth[] {
  const max = Math.max(0, ...rows.map((r) => cents(r.received_cents)));
  return rows.map((r, i) => {
    const value = cents(r.received_cents);
    return {
      monthStart: r.month_start,
      label: monthLabel(r.month_start, "short"),
      longLabel: monthLabel(r.month_start, "long"),
      amountLabel: money(r.received_cents, currency),
      // 8% headroom so the tallest bar does not touch the card's title. A month with money in
      // it is never drawn shorter than 2%, or a $40 deposit beside a $4,000 one vanishes.
      heightPct: max === 0 ? 0 : value === 0 ? 0 : Math.max(2, Math.round((value / (max * 1.08)) * 100)),
      // The accessor returns the current month LAST, always.
      isCurrent: i === rows.length - 1,
    };
  });
}

export async function loadCommissionDashboard(): Promise<CommissionDashboard | null> {
  const [dashRes, monthRes] = await Promise.all([
    callAgentRead<AgentCommissionDashboardRow>("agent_commission_dashboard", {}),
    callAgentRead<AgentCommissionMonthRow>("agent_commission_monthly", {}),
  ]);

  if (!dashRes.ok || !monthRes.ok) return null;

  // No row is "not an agent", which the layout should already have caught. It is not an
  // empty dashboard — that is one row of zeros — so it gets the retry screen, not $0.
  const d = dashRes.rows[0];
  if (!d) return null;

  const months = dashboardMonths(monthRes.rows, d.currency);
  const trendPct = percentChange(cents(d.trailing_12_cents), cents(d.prior_12_cents));

  return {
    tiles: dashboardTiles(d),
    months,
    anyReceived: monthRes.rows.some((r) => cents(r.received_cents) > 0),
    trendChange: trendPct === null ? null : commissionTrendChange(trendPct),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.7.2 Ledger
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerRow = {
  commissionId: string;
  /** §3.7.3, live since Stage 2: every row opens its line, archived trip or not. */
  lineHref: string;
  tripTitle: string;
  /** Null for an archived trip: its detail page will not open, so the title is not a link. */
  tripHref: string | null;
  tripArchived: boolean;
  clientName: string;
  supplierName: string;
  travelLabel: string | null;
  grossLabel: string;
  rateLabel: string;
  commissionLabel: string;
  /** A known status, or the raw value if the schema has grown one this screen does not know. */
  status: CommissionStatus | string;
  statusChip: string;
  statusLabel: string;
};

export type LedgerSupplier = { id: string; name: string; lineCount: number };

export type CommissionLedger = {
  rows: LedgerRow[];
  counts: Record<CommissionStatus, number>;
  /** Lines matching the query, before the page window. */
  total: number;
  suppliers: LedgerSupplier[];
  /** The trip's title when the ledger is filtered to one trip and has a row to read it from. */
  tripTitle: string | null;
  page: number;
  pageCount: number;
  pageSize: number;
};

const STATUS_BY_VALUE = new Map<string, (typeof COMMISSION_STATUS_FILTERS)[number]>(
  COMMISSION_STATUS_FILTERS.map((f) => [f.value, f]),
);

export function ledgerRow(r: AgentCommissionLedgerRow): LedgerRow {
  // An unknown status is a schema change this screen has not caught up with. It renders as
  // itself on a colourless chip (StatusChip resolves an unknown kind to no colour) rather
  // than borrowing another status's chip, which would be a claim about the line.
  const known = STATUS_BY_VALUE.get(r.status);
  const status = r.status;
  const presentation = known ?? { chip: "unknown", label: r.status };
  return {
    commissionId: r.commission_id,
    lineHref: `/agent/commission/ledger/${r.commission_id}`,
    tripTitle: r.trip_title,
    tripHref: r.trip_archived ? null : `/agent/trips/${r.trip_id}`,
    tripArchived: r.trip_archived,
    clientName: r.client_display_name,
    supplierName: r.supplier_name,
    travelLabel: travelDateLabel(r.start_date),
    grossLabel: money(r.gross_booking_cents, r.currency),
    rateLabel: rateLabel(r.commission_pct),
    commissionLabel: money(r.expected_commission_cents, r.currency),
    status,
    statusChip: presentation.chip,
    statusLabel: presentation.label,
  };
}

export async function loadCommissionLedger(query: LedgerQuery): Promise<CommissionLedger | null> {
  const [rowsRes, summaryRes, supplierRes] = await Promise.all([
    callAgentRead<AgentCommissionLedgerRow>("agent_commission_ledger", {
      p_status: query.statuses.length > 0 ? query.statuses : null,
      p_supplier_id: query.supplierId,
      p_trip_id: query.tripId,
      p_travel_from: query.travelFrom,
      p_travel_to: query.travelTo,
      p_limit: LEDGER_PAGE_SIZE,
      p_offset: (query.page - 1) * LEDGER_PAGE_SIZE,
    }),
    callAgentRead<AgentCommissionSummaryRow>("agent_commission_ledger_summary", {}),
    callAgentRead<AgentCommissionSupplierRow>("agent_commission_ledger_suppliers", {}),
  ]);

  if (!rowsRes.ok || !summaryRes.ok || !supplierRes.ok) return null;

  const raw = rowsRes.rows;
  const summary = summaryRes.rows[0];
  // `total_count` rides on every row and is the count BEFORE the page window. With no rows
  // there is nothing to read it off, and zero is the right answer anyway.
  const total = raw[0]?.total_count ?? 0;

  return {
    rows: raw.map(ledgerRow),
    counts: {
      expected: summary?.expected_count ?? 0,
      invoiced: summary?.invoiced_count ?? 0,
      received: summary?.received_count ?? 0,
      disputed: summary?.disputed_count ?? 0,
      lost: summary?.lost_count ?? 0,
    },
    total,
    suppliers: supplierRes.rows.map((s) => ({
      id: s.supplier_id,
      name: s.supplier_name,
      lineCount: s.line_count,
    })),
    tripTitle: query.tripId ? raw[0]?.trip_title ?? null : null,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE)),
    pageSize: LEDGER_PAGE_SIZE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.7.3 Detail
// ─────────────────────────────────────────────────────────────────────────────

export type CommissionLineView = {
  commissionId: string;
  version: number;
  tripId: string;
  tripTitle: string;
  /** Null for an archived trip: Trip Detail will not open it. */
  tripHref: string | null;
  tripArchived: boolean;
  clientName: string;
  supplierName: string;
  /** The prototype's header: "Sandals Resorts · Kyoto in the spring · $1,368 expected". */
  heading: string;
  status: string;
  statusChip: string;
  statusLabel: string;
  isPaid: boolean;
  expectedCents: number;
  expectedLabel: string;
  /** "Received $1,190 on Feb 21, 2027, after a $12 fee." — only for a paid line. */
  paidLine: string | null;
  termsLine: string;
  /** "Expected around Oct 18, 2026." — or why there is no date yet. */
  expectationLine: string;
  canRemove: boolean;
  today: string;
  /** The edit form's starting values. */
  lineValues: LineValues;
  /** The payment form's starting values: what was recorded, or expected-in-full today. */
  paymentValues: PaymentValues;
  currency: string;
};

export type CommissionLineResult =
  | { ok: true; line: CommissionLineView }
  | { ok: false; reason: "not-found" | "unavailable" };

export function lineView(r: AgentCommissionLineRow): CommissionLineView {
  const known = STATUS_BY_VALUE.get(r.status);
  const expected = cents(r.expected_commission_cents);
  const isPaid = r.status === "received" || r.status === "disputed";
  const fee = cents(r.processing_fee_cents);

  const expectedDate = travelDateLabel(r.expected_payment_date);
  const expectationLine = expectedDate
    ? commissionExpectedOn(expectedDate)
    : r.payment_terms === "at_booking"
      ? COMMISSION_COPY.expectationNotBooked
      : COMMISSION_COPY.expectationNoEnd;

  return {
    commissionId: r.commission_id,
    version: r.version,
    tripId: r.trip_id,
    tripTitle: r.trip_title,
    tripHref: r.trip_archived ? null : `/agent/trips/${r.trip_id}`,
    tripArchived: r.trip_archived,
    clientName: r.client_display_name,
    supplierName: r.supplier_name,
    heading: commissionLineHeading(r.supplier_name, r.trip_title, money(r.expected_commission_cents, r.currency)),
    status: r.status,
    statusChip: known?.chip ?? "unknown",
    statusLabel: known?.label ?? r.status,
    isPaid,
    expectedCents: expected,
    expectedLabel: money(r.expected_commission_cents, r.currency),
    // To the cent: this is the record of what arrived, beside a form that shows cents. In
    // whole dollars $1,189.50 read as $1,190 and a 40-cent fee as "a $0 fee".
    paidLine: isPaid && r.received_at
      ? commissionPaidLine(
          formatTripMoney(cents(r.received_commission_cents), r.currency),
          travelDateLabel(r.received_at) ?? r.received_at,
          fee > 0 ? formatTripMoney(fee, r.currency) : null,
        )
      : null,
    termsLine: commissionTermsLine(r.supplier_name, r.payment_terms, r.payment_lag_days),
    expectationLine,
    canRemove: r.can_remove,
    today: r.as_of_date,
    lineValues: {
      supplierId: r.supplier_id,
      gross: centsToDollars(r.gross_booking_cents),
      rate: String(Number(r.commission_pct)),
      paymentTerms: r.payment_terms,
      paymentLagDays: String(r.payment_lag_days),
      status: r.status,
      inteletravelReference: r.inteletravel_reference ?? "",
      notes: r.notes ?? "",
    },
    paymentValues: isPaid
      ? {
          status: r.status,
          received: centsToDollars(r.received_commission_cents),
          fee: centsToDollars(r.processing_fee_cents),
          receivedAt: r.received_at ?? r.as_of_date,
        }
      // Unpaid: the amount starts BLANK. Pre-filling expected-in-full meant Enter in any field
      // recorded a full payment nobody had checked against the statement.
      : { status: "received", received: "", fee: "0.00", receivedAt: r.as_of_date },
    currency: r.currency,
  };
}

export async function loadCommissionLine(commissionId: string): Promise<CommissionLineResult> {
  const res = await callAgentRead<AgentCommissionLineRow>("agent_commission_line", {
    p_commission_id: commissionId,
  });
  if (!res.ok) return { ok: false, reason: "unavailable" };
  // No row is "not yours", "removed", or "never existed" — deliberately indistinguishable.
  const row = res.rows[0];
  return row ? { ok: true, line: lineView(row) } : { ok: false, reason: "not-found" };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.7.4 Add
// ─────────────────────────────────────────────────────────────────────────────

export type TripPick = {
  tripId: string;
  title: string;
  clientName: string;
  travelLabel: string | null;
  statusLabel: string;
};

/**
 * The trips a line can be filed against: every live trip in the book, whatever its stage —
 * a cancelled trip can owe a `lost` line, and a completed one is where most lines land.
 */
export async function searchTripsForLine(search: string): Promise<TripPick[] | null> {
  const res = await callAgentRead<AgentTripRosterRow>("agent_trip_roster", {
    p_status: ["inquiry", "proposal", "booked", "in_progress", "completed", "cancelled"],
    p_client_id: null,
    p_search: search.length > 0 ? search : null,
    p_limit: 25,
    p_offset: 0,
  });
  if (!res.ok) return null;
  return res.rows.map((r) => ({
    tripId: r.trip_id,
    title: r.title,
    clientName: r.client_display_name,
    travelLabel: travelDateLabel(r.start_date),
    statusLabel: r.status.replace("_", " "),
  }));
}

export type AddLineForm = {
  trip: { tripId: string; title: string; clientName: string; currency: string };
  suppliers: SupplierGroup[];
  /** Keyed by supplier id: what that supplier's components on this trip add up to. */
  prefill: Record<string, SupplierPrefill>;
};

export type AddLineFormResult =
  | { ok: true; form: AddLineForm }
  | { ok: false; reason: "not-found" | "unavailable" };

export async function loadAddLineForm(tripId: string): Promise<AddLineFormResult> {
  const [overviewRes, componentsRes, suppliers] = await Promise.all([
    callAgentRead<AgentTripOverviewRow>("agent_trip_overview", { p_trip_id: tripId }),
    callAgentRead<AgentTripComponentRow>("agent_trip_components", { p_trip_id: tripId }),
    loadSuppliers(),
  ]);
  if (!overviewRes.ok || !componentsRes.ok || !suppliers) return { ok: false, reason: "unavailable" };

  const trip = overviewRes.rows[0];
  if (!trip) return { ok: false, reason: "not-found" };

  return {
    ok: true,
    form: {
      trip: {
        tripId: trip.trip_id,
        title: trip.title,
        clientName: trip.client_display_name,
        currency: trip.currency,
      },
      suppliers,
      prefill: prefillBySupplier(componentsRes.rows.map((c) => ({
        supplierId: c.supplier_id,
        costCents: cents(c.cost_cents),
        commissionPct: c.commission_pct === null ? null : Number(c.commission_pct),
      }))),
    },
  };
}
