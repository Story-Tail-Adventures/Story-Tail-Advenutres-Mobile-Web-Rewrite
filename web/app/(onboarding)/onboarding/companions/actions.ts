"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callOnboarding } from "@/lib/onboarding/api";
import { WIZARD_STEPS } from "@/lib/onboarding/steps";
import { COMPANION_FIELDS, companionSchema } from "@/lib/validation/companion";
import { flattenIssues } from "@/lib/validation/flatten";
import { COMPANIONS_TEXT, type CompanionsState } from "./state";

/**
 * Screen 2.1.12's four actions.
 *
 * Unlike the two steps before it, this screen writes a LIST, so saving and continuing are
 * separate things: each traveler is saved as they are added, and "Save & continue" only
 * moves the cursor. That is what makes the list survive a closed tab halfway through
 * entering a household.
 *
 * Every write goes through supabase/functions/onboarding-companions. `companion` grants
 * SELECT only to `authenticated`, and `client_id` is the sole thing scoping a companion to
 * an agent's book of business — so the id in an edit or a remove is re-checked against the
 * caller's own client there, never trusted from here.
 */

/** 2.1.13 Connect with Agent — the step after this one, from the one shared list. */
const NEXT_ROUTE = WIZARD_STEPS[4].route;
const NEXT_STEP = WIZARD_STEPS[4].slug;

export async function saveCompanionAction(
  _prev: CompanionsState,
  formData: FormData,
): Promise<CompanionsState> {
  const editingId = text(formData.get("id")) || undefined;
  const values = {
    firstName: text(formData.get("firstName")),
    lastName: text(formData.get("lastName")),
    relationship: text(formData.get("relationship")),
    dateOfBirth: text(formData.get("dateOfBirth")),
    passportExpiry: text(formData.get("passportExpiry")),
    passportCountry: text(formData.get("passportCountry")),
  };

  const parsed = companionSchema.safeParse(values);
  if (!parsed.success) {
    return {
      fieldErrors: flattenIssues(parsed.error, COMPANION_FIELDS),
      values,
      editingId,
    };
  }

  const result = await callOnboarding("onboarding-companions", {
    action: editingId ? "edit" : "add",
    ...(editingId ? { id: editingId } : {}),
    ...parsed.data,
  });

  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return {
      formError: result.detail ?? COMPANIONS_TEXT.errorSave,
      values,
      editingId,
    };
  }

  // The list is a server read, so the page has to be rebuilt for the new row to appear.
  revalidatePath("/onboarding/companions");
  // A fresh value every time, so editing the same row twice still closes the form on the
  // second save — an id would be unchanged and the effect watching it would not fire.
  return { savedToken: Date.now() };
}

export async function removeCompanionAction(
  _prev: CompanionsState,
  formData: FormData,
): Promise<CompanionsState> {
  const id = text(formData.get("id"));
  if (!id) return { formError: COMPANIONS_TEXT.errorRemove };

  const result = await callOnboarding("onboarding-companions", {
    action: "remove",
    id,
  });
  if (!result.ok) {
    if (result.kind === "unauthenticated") redirect("/login");
    return { formError: COMPANIONS_TEXT.errorRemove };
  }

  revalidatePath("/onboarding/companions");
  return {};
}

/**
 * "Save & continue" — which saves nothing, because everything is already saved.
 *
 * It posts `action: "none"` rather than an empty body so the function's intent is explicit:
 * this is a cursor move, not a write that happened to have no fields.
 */
export async function continueCompanionsAction(): Promise<void> {
  const result = await callOnboarding("onboarding-companions", {
    action: "none",
    advance: true,
  });
  if (!result.ok && result.kind === "unauthenticated") redirect("/login");
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

export async function skipCompanionsAction(): Promise<void> {
  const result = await callOnboarding("onboarding-step", { step: NEXT_STEP });
  if (!result.ok && result.kind === "unauthenticated") redirect("/login");
  revalidatePath("/", "layout");
  redirect(NEXT_ROUTE);
}

/** A File — from a multipart post that has no business here — is not a value. */
function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
