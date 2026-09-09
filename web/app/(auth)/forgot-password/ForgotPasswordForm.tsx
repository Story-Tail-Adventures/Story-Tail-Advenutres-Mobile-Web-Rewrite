"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { requestPasswordResetAction } from "./actions";
import { FORGOT_TEXT, initialForgotPasswordState } from "./state";

/**
 * Screen 2.1.4 Forgot Password — the interactive half (design: C214 / M214).
 *
 * A client island only because `useActionState` needs one; every string is in ./state.ts
 * and every rule in ./actions.ts.
 */
export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialForgotPasswordState,
  );

  if (state.outcome === "sent") {
    return (
      <div role="status" className="flex flex-col">
        <h2 className="t-title-l text-on-surface">{FORGOT_TEXT.sentTitle}</h2>
        <p className="t-body mt-1.5 text-on-surface-variant">
          {FORGOT_TEXT.sentBefore}
          <b className="font-semibold text-on-surface">{state.email}</b>
          {FORGOT_TEXT.sentAfter}
        </p>
        <Card variant="flat" className="mt-3.5 p-3.5">
          <p className="t-body-s text-on-surface-variant">{FORGOT_TEXT.help}</p>
        </Card>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <FormError error={state.formError} />

      <fieldset disabled={isPending} className="contents">
        <Field
          id="email"
          name="email"
          label={FORGOT_TEXT.email}
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />
      </fieldset>

      <SubmitButton label={FORGOT_TEXT.submit} pendingLabel={FORGOT_TEXT.pending} />

      <p className="t-body-s text-on-surface-variant">{FORGOT_TEXT.help}</p>

      <Link href="/login" className="t-label-l tap-44 self-start text-primary">
        {FORGOT_TEXT.backToSignIn}
      </Link>
    </form>
  );
}
