"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callAgentFunction } from "@/lib/agent/api";
import { FORECAST_COPY } from "@/lib/agent/content";
import { weightsFromForm, type WeightsFormState } from "@/lib/agent/forecastWeights";

const FORECAST = "/agent/commission/forecast";

/**
 * 3.7.7's "Adjust weighting". Saves the four open stages' weights through `agent-commission`
 * (`weights`), naming the weights the screen showed so a change made elsewhere since is a
 * stale refusal, not an overwrite.
 *
 * The worklist's "Commission expected" uses the same weights, so its page is refreshed too.
 */
export async function saveWeightsAction(_prev: WeightsFormState, form: FormData): Promise<WeightsFormState> {
  // The typed numbers stay in the form's own controlled state; a refusal only says why.
  const read = weightsFromForm(form);
  if (!read.ok) return { formError: read.error };

  const call = await callAgentFunction("agent-commission", {
    op: "weights",
    weights: read.weights,
    expected: read.expected,
  });

  if (!call.ok) {
    if (call.kind === "unauthenticated") redirect(`/login?next=${encodeURIComponent(FORECAST)}`);
    if (call.conflict) return { formError: FORECAST_COPY.stale };
    return {
      formError: call.kind === "rejected" ? (call.detail ?? FORECAST_COPY.saveFailed) : FORECAST_COPY.saveFailed,
    };
  }

  revalidatePath(FORECAST);
  revalidatePath("/agent");
  redirect(FORECAST);
}
