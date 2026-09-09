"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { WIZARD_STEPS } from "@/lib/onboarding/steps";
import { CONNECT_TEXT, type ConnectState } from "./state";

/**
 * Screen 2.1.13's two exits.
 *
 * The code never touches this layer beyond being handed straight on: it is not logged, not
 * put in a URL, and not returned in the state except back into the input it came from.
 * `client_invite` has RLS enabled with zero policies and the hash function's EXECUTE is
 * granted only to the service role, so the browser could not check a code even if this
 * tried to.
 */

/** 2.1.14 All set — the step after this one, from the one shared list. */
const NEXT_ROUTE = WIZARD_STEPS[5].route;
const NEXT_STEP = WIZARD_STEPS[5].slug;

export async function connectAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw.trim() : "";

  const result = await callOnboarding("onboarding-connect", {
    // An empty box is a legitimate way to press the primary button — it means "carry on".
    ...(code === "" ? {} : { code }),
    advance: true,
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    // `detail` is the function's own sentence about what was wrong with the code, and it is
    // the whole point of the reply — a generic failure would leave somebody with an expired
    // invitation retyping it forever.
    return { formError: result.detail ?? CONNECT_TEXT.formError, code };
  }

  // Redemption repoints platform_user.client_id, so every cached read about "this traveler"
  // is now about somebody else. The whole layout has to go.
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

export async function skipConnectAction(): Promise<void> {
  const result = await callOnboarding("onboarding-step", { step: NEXT_STEP });
  if (!result.ok && result.kind === "unauthenticated") redirect("/login");
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}
