"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callOnboarding } from "@/lib/onboarding/api";
import { flattenIssues } from "@/lib/validation/flatten";
import { PROFILE_FIELDS, profileSchema, toProfilePayload } from "@/lib/validation/profile";
import { readProfileForm } from "@/lib/validation/profile-form";
import { PROFILE_TEXT, type ProfileState } from "@/app/(onboarding)/onboarding/profile/state";

/**
 * Screen 2.5.2's save — 2.1.10's write without the wizard.
 *
 * `advance` is OMITTED. `onboarding-profile` gates the cursor move behind that flag, so
 * leaving it off takes the write and leaves onboarding alone. Everything else is shared:
 * `readProfileForm`, `profileSchema`, `toProfilePayload`, and the function itself.
 *
 * WHAT THIS DELIBERATELY DOES NOT SEND: the email address. Changing an email is GoTrue's
 * (`supabase.auth.updateUser`), not a column write — and `account.email` is mirrored back by
 * a trigger that does not exist yet, which is why 2.5.2 shows the address read-only. A
 * function writing `account.email` directly would leave the login address and the CRM record
 * disagreeing. Nor the name: no Edge Function writes `client.first_name`/`last_name` at all.
 */
export async function saveAccountProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const values = readProfileForm(formData);

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, PROFILE_FIELDS), values };
  }

  const result = await callOnboarding("onboarding-profile", {
    ...toProfilePayload(parsed.data),
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return { formError: result.detail ?? PROFILE_TEXT.formError, values };
  }

  revalidatePath("/account/personal");
  redirect("/account");
}
