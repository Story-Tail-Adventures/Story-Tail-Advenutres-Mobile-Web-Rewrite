"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { callTripFunction } from "@/lib/trips/api";
import { uuidV7 } from "@/lib/uuid";

/**
 * Server actions for Screens 2.4.3 and 2.4.7.
 *
 * BOTH GO THROUGH `card-authorization`, which takes an explicit `action` rather than
 * inferring one from which fields are present. Create and revoke need the identical
 * ownership proof, so they share a function; guessing the caller's intent from a missing
 * field is how a revoke ends up looking like a half-filled create.
 *
 * NEITHER TOUCHES A CARD. `payment_card.status` is not writable from this surface at all —
 * setting it locally would leave the PaymentMethod live in Stripe's vault while the screen
 * says the card is gone. See the amendment at Screen-Inventory §2.4.7.
 */

export type AuthorizeState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Duplicated from `WALLET.authorizeFailed` / `.removeFailed` rather than imported.
 *
 * A `"use server"` module's imports all land in the server bundle, and this file is imported
 * by client components for its action references — pulling the content module in here to
 * reach two strings would drag the section's whole copy table along with it. Same reason
 * `lib/trips/actions.ts` and `lib/messages/actions.ts` each duplicate theirs.
 */
const AUTHORIZE_FAILED =
  "That didn't go through. Nothing was authorized — try again in a moment.";
const REMOVE_FAILED =
  "That didn't go through. The authorization is unchanged — try again in a moment.";
const CONSENT_REQUIRED = "Tick the box to authorize.";

/**
 * Authorize a card for a trip — 2.4.3, landing on 2.4.4.
 *
 * THE CONSENT CHECKBOX IS CHECKED SERVER-SIDE, not merely disabled in the UI. It is the
 * thing that makes `card_authorization.consent_payload` mean something: a mandate recorded
 * for somebody who never ticked the box is worse than no record at all. The browser can lie
 * about the checkbox; this is where that stops mattering.
 */
export async function authorizeCard(
  tripId: string,
  _previous: AuthorizeState,
  formData: FormData,
): Promise<AuthorizeState> {
  const cardId = formData.get("cardId");
  const limitRaw = formData.get("spendingLimitCents");
  const expiresAt = formData.get("expiresAt");
  const consent = formData.get("consent");

  if (consent !== "on") return { status: "error", message: CONSENT_REQUIRED };
  if (typeof cardId !== "string" || typeof expiresAt !== "string") {
    return { status: "error", message: AUTHORIZE_FAILED };
  }

  // The form carries cents already — the dollar-to-cents conversion happens in the field,
  // where the traveler can see the number it produced, rather than here where they cannot.
  const spendingLimitCents = Number(limitRaw);
  if (!Number.isSafeInteger(spendingLimitCents) || spendingLimitCents <= 0) {
    return { status: "error", message: AUTHORIZE_FAILED };
  }

  const authorizationId = uuidV7();
  const result = await callTripFunction("card-authorization", {
    method: "POST",
    body: { action: "create", authorizationId, cardId, tripId, spendingLimitCents, expiresAt },
  });

  if (!result.ok) {
    return {
      status: "error",
      // A 4xx detail is a sentence we wrote — "That card is already authorized for this
      // trip" is more useful than the generic line. A 5xx detail is never surfaced.
      message: result.kind === "rejected" && result.detail ? result.detail : AUTHORIZE_FAILED,
    };
  }

  revalidatePath("/wallet");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/dashboard");

  // `redirect` throws, so it is last and outside any try. 2.4.4 is a route rather than a
  // flash of state on 2.4.3, because it is a screen a traveler may want to return to.
  redirect(`/wallet/authorizations/${authorizationId}?new=1`);
}

/** Remove one authorization — 2.4.7. */
export async function removeAuthorization(
  authorizationId: string,
  _previous: AuthorizeState,
  _formData: FormData,
): Promise<AuthorizeState> {
  const result = await callTripFunction("card-authorization", {
    method: "POST",
    body: { action: "revoke", authorizationId },
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.kind === "rejected" && result.detail ? result.detail : REMOVE_FAILED,
    };
  }

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  redirect("/wallet");
}
