"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callOnboarding } from "@/lib/onboarding/api";
import { parsePreferences } from "@/lib/validation/preferences";
import { readPreferencesForm } from "@/lib/validation/preferences-form";
import {
  PREFERENCES_TEXT,
  type PreferencesState,
} from "@/app/(onboarding)/onboarding/preferences/state";

/**
 * Screen 2.5.3's save — the same write as 2.1.11, without the wizard.
 *
 * `advance` is OMITTED, which is the whole difference. `onboarding-preferences` gates the
 * cursor move behind that flag, so leaving it off takes the write and leaves onboarding
 * alone — which is what an account screen wants, and why this reuses that function rather
 * than growing a second one. The table grants SELECT only and has no write policy, so a
 * browser `.update()` would match zero rows and report success.
 *
 * Field parsing is `parsePreferences` verbatim — the same closed vocabularies the CHECK
 * constraints enforce. A second set of rules here is exactly what the Screen Inventory note
 * at 2.5.3 says not to build.
 */
export async function saveAccountPreferencesAction(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const values = readPreferencesForm(formData);

  const parsed = parsePreferences(values);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };

  // Spread, not passed directly: `PreferencesPayload` is a typed interface with no index
  // signature, and `callOnboarding` takes `Record<string, unknown>`. The wizard spreads for
  // the same reason — it just happens to be adding `advance: true` at the same time.
  //
  // NOTE what is NOT here: `advance`. That flag is the only difference between this and
  // 2.1.11, and omitting it is what keeps an account edit from moving the onboarding cursor.
  const result = await callOnboarding("onboarding-preferences", { ...parsed.payload });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return { formError: result.detail ?? PREFERENCES_TEXT.formError, values };
  }

  revalidatePath("/account/preferences");
  redirect("/account");
}
