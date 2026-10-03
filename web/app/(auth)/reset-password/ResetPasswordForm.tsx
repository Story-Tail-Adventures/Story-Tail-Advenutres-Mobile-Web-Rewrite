"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import { FormError } from "@/components/auth/FormError";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Field } from "@/components/ui/Field";
import { resetPasswordAction } from "./actions";
import { RESET_TEXT, initialResetPasswordState } from "./state";

/** The form column: the legacy 14px gap between rows. */
const FORM_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** Screen 2.1.5 Reset Password — the interactive half (design: C215 / M215). */
export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialResetPasswordState,
  );

  return (
    <Box component="form" action={formAction} sx={FORM_SX}>
      <FormError error={state.formError} />

      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
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
      </Box>

      <SubmitButton label={RESET_TEXT.submit} pendingLabel={RESET_TEXT.pending} />
    </Box>
  );
}
