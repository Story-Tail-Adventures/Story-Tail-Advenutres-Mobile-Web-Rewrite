"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { signOutAction } from "@/lib/auth/actions";
import { changeEmailAction, resendVerificationAction } from "./actions";
import {
  VERIFY_TEXT,
  initialChangeEmailState,
  initialResendState,
} from "./state";

/**
 * Screen 2.1.3 Email Verification — the interactive half (design: C213 / M213).
 *
 * `sessionEmail` is non-null only when someone reaches this screen with a live session.
 * When it is null the resend form has to ask for the address, because straight after
 * sign-up GoTrue has not issued a session and there is nothing to read it from.
 */
export function VerifyEmailPanel({ sessionEmail }: { sessionEmail: string | null }) {
  const [resend, resendAction, resendPending] = useActionState(
    resendVerificationAction,
    initialResendState,
  );
  const [changed, changeAction, changePending] = useActionState(
    changeEmailAction,
    initialChangeEmailState,
  );
  const [changing, setChanging] = useState(false);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-center py-3.5">
        <span className="flex size-21 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <Icon name="mail" size={36} />
        </span>
      </div>

      <Card variant="flat" className="p-3.5">
        <p className="t-title-s text-on-surface">{VERIFY_TEXT.whyTitle}</p>
        <p className="t-body-s mt-1 text-on-surface-variant">{VERIFY_TEXT.whyBody}</p>
      </Card>

      {changed.outcome === "sent" ? (
        <Alert tone="success">{VERIFY_TEXT.changeEmailSent}</Alert>
      ) : (
        <form action={resendAction} className="flex flex-col gap-3.5">
          <FormError error={resend.formError} />

          {resend.outcome === "sent" && <Alert tone="success">{VERIFY_TEXT.resendSent}</Alert>}

          {!sessionEmail && (
            <fieldset disabled={resendPending} className="contents">
              <Field
                id="email"
                name="email"
                label={VERIFY_TEXT.email}
                type="email"
                autoComplete="email"
                required
                defaultValue={resend.email}
                error={resend.fieldErrors?.email?.[0]}
              />
            </fieldset>
          )}

          <SubmitButton
            label={VERIFY_TEXT.resend}
            pendingLabel={VERIFY_TEXT.resendPending}
          />
        </form>
      )}

      {sessionEmail ? (
        <>
          {changed.outcome !== "sent" && (
            <div>
              {changing ? (
                <form action={changeAction} className="flex flex-col gap-2.5">
                  <FormError error={changed.formError} />
                  <fieldset disabled={changePending} className="contents">
                    <Field
                      id="newEmail"
                      name="email"
                      label={VERIFY_TEXT.changeEmailLabel}
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                      defaultValue={changed.email}
                      error={changed.fieldErrors?.email?.[0]}
                    />
                  </fieldset>
                  <SubmitButton
                    label={VERIFY_TEXT.changeEmailSubmit}
                    pendingLabel={VERIFY_TEXT.changeEmailPending}
                  />
                </form>
              ) : (
                <Button variant="text" onClick={() => setChanging(true)}>
                  {VERIFY_TEXT.changeEmailToggle}
                </Button>
              )}
            </div>
          )}

          {/* Its own form: a nested <form> is invalid HTML, and sign-out must not ride
              along on whatever the resend form happens to contain. */}
          <form action={signOutAction}>
            <Button type="submit" variant="text" size="sm">
              {VERIFY_TEXT.signOut}
            </Button>
          </form>
        </>
      ) : (
        <Link href="/register" className="t-label-l tap-44 self-start text-primary">
          {VERIFY_TEXT.useDifferent}
        </Link>
      )}
    </div>
  );
}
