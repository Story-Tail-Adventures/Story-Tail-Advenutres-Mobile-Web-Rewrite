import { FORECAST_COPY } from "@/lib/agent/content";

/**
 * §3.7.7's stage weights — server-free, so the edit form previews with the same arithmetic
 * the server saves with, as `commissionForm.ts` is for the line forms.
 */

/** The four open stages, in pipeline order (Data-Model §7.4). */
export const FORECAST_STAGES = ["inquiry", "proposal", "booked", "in_progress"] as const;
export type ForecastStage = (typeof FORECAST_STAGES)[number];
export type StageWeights = Record<ForecastStage, number>;

export const STAGE_LABEL: Record<ForecastStage, string> = {
  inquiry: FORECAST_COPY.stageInquiry,
  proposal: FORECAST_COPY.stageProposal,
  booked: FORECAST_COPY.stageBooked,
  // The prototype's word: "in progress" is the trip's status, "Traveling" is what it means.
  in_progress: FORECAST_COPY.stageTraveling,
};

export function isForecastStage(value: string): value is ForecastStage {
  return (FORECAST_STAGES as readonly string[]).includes(value);
}

/** A typed weight, or null: a whole number from 0 to 100, nothing else. */
export function parseWeight(input: string): number | null {
  const t = input.trim().replace(/%$/, "");
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

/**
 * Weighted cents for a stage's raw commission, rounded half away from zero — Postgres's
 * numeric rounding, which the forecast and the worklist both use.
 */
export function weightedCents(rawCents: number, weightPct: number): number {
  return Math.round((rawCents * weightPct) / 100);
}

/** The form's fields (`weight-<stage>`, `expected-<stage>`) back as two sets, or an error. */
export function weightsFromForm(
  form: FormData,
): { ok: true; weights: StageWeights; expected: StageWeights } | { ok: false; error: string } {
  const read = (prefix: string): StageWeights | null => {
    const values = FORECAST_STAGES.map((stage) => parseWeight((form.get(`${prefix}-${stage}`) ?? "").toString()));
    if (values.some((v) => v === null)) return null;
    const [inquiry, proposal, booked, in_progress] = values as number[];
    return { inquiry, proposal, booked, in_progress };
  };
  const weights = read("weight");
  const expected = read("expected");
  if (!weights || !expected) return { ok: false, error: FORECAST_COPY.weightsInvalid };
  return { ok: true, weights, expected };
}

export type WeightsFormState = { formError?: string };
