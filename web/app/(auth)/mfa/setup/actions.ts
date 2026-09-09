"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authErrorByKind, mapAuthError } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { flattenIssues } from "@/lib/validation/flatten";
import { MFA_FIELDS, mfaFormSchema } from "@/lib/validation/mfa";
import type { MfaEnrollState, MfaVerifyState } from "./state";

/**
 * Screen 2.1.6 MFA Setup — see docs/Screen-Inventory.md §2.1.6 and
 * design/source-prototype/screens/client-auth.jsx `C216_MFASetup`. P1.
 *
 * Two actions rather than one, and the reason is size. GoTrue returns the QR code as raw
 * SVG — one `<rect>` per module, 300KB of it — and `useActionState` sends the previous
 * state back to the server on every subsequent submit. A single action holding the QR
 * would upload a third of a megabyte each time somebody mistyped their code. Split in two,
 * the QR lives in the enroll action's state, which is never submitted again, and the verify
 * action carries nothing but the factor id and six digits.
 *
 * **Enrolling is a write, so it does not happen on GET.** Rendering the QR from the page
 * would create an unverified factor every time somebody refreshed, and
 * `max_enrolled_factors` (supabase/config.toml) is 10. Hence the explicit button, and hence
 * the sweep in `beginMfaEnrollmentAction`.
 *
 * TWO THINGS THE PROTOTYPE SHOWS THAT ARE NOT BUILT, both deliberate:
 *
 *   * **SMS as a backup method.** `[auth.mfa.phone]` is off in supabase/config.toml, so the
 *     tile renders as unavailable rather than as a button that fails. Turning it on needs a
 *     Twilio account, which is a decision, not an oversight.
 *   * **Backup codes.** Supabase has no backup-code factor, and a home-grown one could not
 *     do the job anyway: Supabase owns the assurance level, so redeeming our own code could
 *     never produce the aal2 session that the MFA gate and the audited PAN reveal check
 *     for. Ten codes that look like a way back in but are not is worse than none. The
 *     recovery path is Screen 3.9.3 — the advisor sends a magic link — which is what the
 *     screen says instead.
 */
export async function beginMfaEnrollmentAction(
  _prev: MfaEnrollState,
  _formData: FormData,
): Promise<MfaEnrollState> {
  if (env.authChecksDisabledForLocalDev) {
    return { formError: authErrorByKind.not_configured };
  }

  const supabase = await createClient();

  // Sweep unverified factors first. Each abandoned attempt leaves one behind, and after ten
  // of them enrollment starts failing for a reason nobody could guess from the screen.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator · ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) {
    console.warn("[auth] mfa enroll failed", { code: error?.code, status: error?.status });
    return { formError: error ? mapAuthError(error) : authErrorByKind.unknown };
  }

  return {
    enrollment: {
      factorId: data.id,
      qrCode: asImageSource(data.totp.qr_code),
      secret: data.totp.secret,
    },
  };
}

/**
 * Make `qr_code` usable as an `<img src>` whichever shape it arrives in.
 *
 * GoTrue's REST response carries raw SVG markup; supabase-js wraps it in a data: URI before
 * handing it over. Wrapping unconditionally double-encodes the already-wrapped one, and the
 * result is a valid-looking data URI that decodes to another data URI — an image that
 * silently renders nothing. Checking is cheaper than depending on which layer is doing the
 * favour this month.
 *
 * A data: URI rather than the markup inline, because rendering a response body as HTML is a
 * habit worth not starting.
 */
function asImageSource(qrCode: string): string {
  if (qrCode.startsWith("data:")) return qrCode;
  return `data:image/svg+xml;base64,${Buffer.from(qrCode).toString("base64")}`;
}

export async function verifyMfaEnrollmentAction(
  _prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  const factorId = String(formData.get("factorId") ?? "");
  const parsed = mfaFormSchema.safeParse({ code: formData.get("code") });

  if (!parsed.success) {
    return { fieldErrors: flattenIssues(parsed.error, MFA_FIELDS) };
  }

  if (env.authChecksDisabledForLocalDev) {
    return { formError: authErrorByKind.not_configured };
  }

  if (!factorId) return { formError: authErrorByKind.unknown };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: parsed.data.code,
  });

  if (error) {
    // Never the code itself — it is a live credential for the next thirty seconds.
    console.warn("[auth] mfa verify failed", { code: error.code, status: error.status });
    if (error.code === "over_request_rate_limit") {
      return { formError: authErrorByKind.rate_limited };
    }
    return { fieldErrors: { code: [WRONG_CODE] } };
  }

  // The session is aal2 now, which changes what the proxy lets through.
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

/**
 * A wrong code is the ordinary case here, not an error condition: codes expire every thirty
 * seconds and people type the one that just rolled over. It should read like a nudge.
 */
const WRONG_CODE =
  "That code didn't match. Codes roll over every 30 seconds — try the current one.";
