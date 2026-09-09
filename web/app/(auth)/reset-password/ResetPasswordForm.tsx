"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Field } from "@/components/ui/Field";
import { resetPasswordAction } from "./actions";
import { RESET_TEXT, initialResetPasswordState } from "./state";

/** Screen 2.1.5 Reset Password — the interactive half (design: C215 / M215). */
export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialResetPasswordState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <FormError error={state.formError} />

      <fieldset disabled={isPending} className="contents">
        <PasswordStrengthField
          id="password"
          name="password"
          label={RESET_TEXT.password}
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          idleHint={RESET_TEXT.passwordHint}
          error={state.fieldErrors?.password?.[0]}
        />
        <Field
          id="confirmPassword"
          name="confirmPassword"
          label={RESET_TEXT.confirm}
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmPassword?.[0]}
        />
      </fieldset>

      <SubmitButton label={RESET_TEXT.submit} pendingLabel={RESET_TEXT.pending} />
    </form>
  );
}
