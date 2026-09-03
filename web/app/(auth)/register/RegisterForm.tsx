"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Card } from "@/components/ui/Card";
import { DividerWithLabel } from "@/components/ui/Divider";
import { Field } from "@/components/ui/Field";
import { registerAction } from "./actions";
import { REGISTER_TEXT, initialRegisterState } from "./state";

/**
 * Screen 2.1.2 Registration — the interactive half (design: C212 / M212).
 *
 * The prototype's social buttons carry mismatched glyphs (a Facebook mark on the Google
 * button, a generic user icon on Apple); both are dropped here, text-only, matching 2.1.1.
 */
export function RegisterForm({
  next,
  googleEnabled,
  appleEnabled,
}: {
  next: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(registerAction, initialRegisterState);

  if (state.outcome === "confirm_email") {
    return (
      <div role="status" className="flex flex-col">
        <h2 className="t-title-l text-on-surface">{REGISTER_TEXT.confirmTitle}</h2>
        <p className="t-body mt-1.5 text-on-surface-variant">
          {REGISTER_TEXT.confirmBefore}
          <b className="font-semibold text-on-surface">{state.email}</b>
          {REGISTER_TEXT.confirmAfter}
        </p>
        <Card variant="flat" className="mt-3.5 p-3.5">
          <p className="t-title-s text-on-surface">{REGISTER_TEXT.whyTitle}</p>
          <p className="t-body-s mt-1 text-on-surface-variant">{REGISTER_TEXT.whyBody}</p>
        </Card>
        <Link href="/verify-email" className="t-label-l tap-44 mt-3.5 self-start text-primary">
          {REGISTER_TEXT.verifyCta}
        </Link>
      </div>
    );
  }

  const termsError = state.fieldErrors?.terms?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="next" value={next} />

      <FormError error={state.formError} />

      {/* These submit this same form to signInWithProviderAction — see SocialButtons.
          Inside a disabled fieldset because they are submit buttons on a form that may
          already be submitting: left live, a click during sign-up starts a second,
          concurrent submission of the same form. `contents` keeps the flex gap. */}
      <fieldset disabled={isPending} className="contents">
        <SocialButtons
          googleEnabled={googleEnabled}
          appleEnabled={appleEnabled}
          googleLabel={REGISTER_TEXT.google}
          appleLabel={REGISTER_TEXT.apple}
          disabledTitle={REGISTER_TEXT.socialDisabledTitle}
        />
      </fieldset>

      <DividerWithLabel label={REGISTER_TEXT.divider} />

      <fieldset disabled={isPending} className="contents">
        <div className="grid grid-cols-2 gap-2.5">
          <Field
            id="firstName"
            name="firstName"
            label={REGISTER_TEXT.firstName}
            autoComplete="given-name"
            autoFocus
            required
            defaultValue={state.firstName}
            error={state.fieldErrors?.firstName?.[0]}
          />
          <Field
            id="lastName"
            name="lastName"
            label={REGISTER_TEXT.lastName}
            autoComplete="family-name"
            required
            defaultValue={state.lastName}
            error={state.fieldErrors?.lastName?.[0]}
          />
        </div>

        <Field
          id="email"
          name="email"
          label={REGISTER_TEXT.email}
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />

        <PasswordStrengthField
          id="password"
          name="password"
          label={REGISTER_TEXT.password}
          type="password"
          autoComplete="new-password"
          required
          idleHint={REGISTER_TEXT.passwordHint}
          error={state.fieldErrors?.password?.[0]}
        />

        <Field
          id="confirmPassword"
          name="confirmPassword"
          label={REGISTER_TEXT.confirm}
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmPassword?.[0]}
        />

        <div>
          <label className="t-body-s flex items-start gap-2.5 text-on-surface-variant">
            <input
              id="terms"
              type="checkbox"
              name="terms"
              className="filter-box mt-0.5"
              required
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? "terms-error" : undefined}
            />
            <span>
              {REGISTER_TEXT.termsBefore}
              <Link href="/legal/terms" className="text-primary underline underline-offset-2">
                {REGISTER_TEXT.termsLink}
              </Link>
              {REGISTER_TEXT.termsAnd}
              <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
                {REGISTER_TEXT.privacyLink}
              </Link>
            </span>
          </label>
          {termsError && (
            <p id="terms-error" className="t-body-s mt-1.5 text-error">
              {termsError}
            </p>
          )}
        </div>
      </fieldset>

      <SubmitButton label={REGISTER_TEXT.submit} pendingLabel={REGISTER_TEXT.pending} />
    </form>
  );
}
