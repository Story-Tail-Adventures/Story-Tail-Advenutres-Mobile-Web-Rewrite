import {
  callAgentRead,
  type AgentCommissionCashInRow,
  type AgentCommissionForecastRow,
} from "@/lib/agent/api";
import { FORECAST_COPY, forecastAcross, forecastReceivedNote, forecastTripCount } from "@/lib/agent/content";
import { FORECAST_STAGES, isForecastStage, STAGE_LABEL, type ForecastStage } from "@/lib/agent/forecastWeights";
import { cents, money } from "@/lib/agent/queries";

/**
 * §3.7.7's view model, built like `commission.ts`: plain data out, formatted here, `null`
 * from the loader when a READ failed.
 *
 * WHOLE DOLLARS, like the dashboard: this is a projection, and cents would claim a precision
 * a 50% weight does not have. (Statements are to the cent; they are records.)
 *
 * TRIP GRAIN. The forecast's totals ARE agent_kpis' own: the worklist's "Commission expected"
 * tile shows the unweighted total and the confidence; this screen leads with the weighted one,
 * by stage, and the calendar is that weighted figure by month. Nothing here reads a ledger line except, inside the SQL,
 * money already received — which comes off, so calendar + received = forecast.
 */

export type ForecastStageView = {
  stage: ForecastStage;
  label: string;
  weightPct: number;
  tripCount: number;
  tripCountLabel: string;
  /** Raw commission, in cents, so the edit form can preview a new weight. */
  rawCents: number;
  weightedLabel: string;
};

export type CashInRowView = {
  key: string;
  label: string;
  cents: number;
  amountLabel: string;
  /** 0–100, against the largest row shown. */
  barPct: number;
  kind: "overdue" | "month" | "later" | "undated";
};

export type CommissionForecast = {
  totalLabel: string;
  /** Null with no open trips: "Of $0 across 0 open trips" says nothing. */
  acrossLabel: string | null;
  anyCommission: boolean;
  stages: ForecastStageView[];
  calendar: CashInRowView[];
  receivedNote: string | null;
  currency: string;
};

/** "Oct 2026" for the first month and every January, "Nov" otherwise: the year only where it turns. */
function monthLabel(iso: string, first: boolean): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const withYear = first || d.getUTCMonth() === 0;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(d);
}

const BUCKETS = ["overdue", "month", "later", "undated"] as const;
type Bucket = (typeof BUCKETS)[number];
function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}

export function forecastView(
  stages: AgentCommissionForecastRow[],
  calendar: AgentCommissionCashInRow[],
): CommissionForecast {
  const currency = "USD";
  const totalRaw = stages[0] ? cents(stages[0].total_raw_cents) : 0;
  const totalWeighted = stages[0] ? cents(stages[0].total_weighted_cents) : 0;
  const trips = stages.reduce((n, s) => n + s.trip_count, 0);
  // The worklist's confidence figure: weighted over unweighted. Null, not 0%, when there is
  // nothing to be confident about.
  const confidence = totalRaw > 0 ? Math.round((totalWeighted * 100) / totalRaw) : null;

  // Overdue, later and undated only when they hold money; the twelve months always. A bucket
  // this file does not know is dropped, never drawn as a month it is not.
  const shown = calendar.filter((r) => isBucket(r.bucket) && (r.bucket === "month" || cents(r.cents) > 0));
  const max = Math.max(1, ...shown.map((r) => cents(r.cents)));
  let firstMonth = true;
  const rows: CashInRowView[] = shown.map((r) => {
    const amount = cents(r.cents);
    const kind: Bucket = isBucket(r.bucket) ? r.bucket : "month";
    let label: string;
    if (kind === "month" && r.month_start) {
      label = monthLabel(r.month_start, firstMonth);
      firstMonth = false;
    } else {
      label = kind === "overdue" ? FORECAST_COPY.overdue : kind === "later" ? FORECAST_COPY.later : FORECAST_COPY.undated;
    }
    return {
      key: kind === "month" ? (r.month_start ?? kind) : kind,
      label,
      cents: amount,
      amountLabel: money(r.cents, currency),
      // A sliver for any money at all: $5 beside $20,000 is still not nothing.
      barPct: amount > 0 ? Math.max(2, Math.round((amount / max) * 100)) : 0,
      kind,
    };
  });

  const received = calendar[0] ? cents(calendar[0].received_cents) : 0;

  return {
    totalLabel: money(String(totalWeighted), currency),
    acrossLabel: trips > 0 ? forecastAcross(money(String(totalRaw), currency), trips, confidence) : null,
    anyCommission: totalRaw > 0,
    stages: stages.flatMap((s) => {
      const stage = s.status;
      if (!isForecastStage(stage)) return [];
      return [{
        stage,
        label: STAGE_LABEL[stage],
        weightPct: s.weight_pct,
        tripCount: s.trip_count,
        tripCountLabel: forecastTripCount(s.trip_count),
        rawCents: cents(s.raw_cents),
        weightedLabel: money(s.weighted_cents, currency),
      }];
    }),
    calendar: rows,
    receivedNote: received > 0 ? forecastReceivedNote(money(String(received), currency)) : null,
    currency,
  };
}

export async function loadCommissionForecast(): Promise<CommissionForecast | null> {
  const [stages, calendar] = await Promise.all([
    callAgentRead<AgentCommissionForecastRow>("agent_commission_forecast"),
    callAgentRead<AgentCommissionCashInRow>("agent_commission_cash_in"),
  ]);
  if (!stages.ok || !calendar.ok) return null;
  // Not one row per open stage (not an advisor, or weights never seeded) is a read that did
  // not answer, not a $0 forecast with a live Adjust button that cannot save.
  if (stages.rows.length !== FORECAST_STAGES.length) return null;
  return forecastView(stages.rows, calendar.rows);
}
