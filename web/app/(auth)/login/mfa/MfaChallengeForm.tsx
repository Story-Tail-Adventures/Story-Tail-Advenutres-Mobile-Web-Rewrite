"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { signOutAction } from "@/lib/auth/actions";
import { MFA_CODE_LENGTH } from "@/lib/validation/mfa";
import { mfaChallengeAction } from "./actions";
import { MFA_CHALLENGE_TEXT, initialMfaChallengeState } from "./state";

/**
 * Screen 2.1.7 MFA Challenge — the interactive half (design: C217 / M217).
 *
 * The prototype draws six separate boxes. This is one input styled to read the same way
 * (mono, centred, wide tracking — the treatment C216 itself uses for its code field).
 * Six inputs would break paste, which is how most people move a code across from an
 * authenticator, and would give a screen reader six unlabelled fields to announce.
 * `autoComplete="one-time-code"` is what lets iOS and Android offer the code from the
 * notification, which no amount of visual fidelity would make up for.
 */
export function MfaChallengeForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(
    mfaChallengeAction,
    initialMfaChallengeState,
  );

  return (
    <div className="flex flex-col gap-3.5">
      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="next" value={next} />

        <FormError error={state.formError} />

        <fieldset disabled={isPending} className="contents">
          <Field
            id="code"
            name="code"
            label={MFA_CHALLENGE_TEXT.codeLabel}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={MFA_CODE_LENGTH + 2}
            error={state.fieldErrors?.code?.[0]}
            className="text-center font-mono text-lg tracking-[0.5em]"
          />
        </fieldset>

        <SubmitButton
          label={MFA_CHALLENGE_TEXT.verify}
          pendingLabel={MFA_CHALLENGE_TEXT.pending}
        />
      </form>

      <Card variant="flat" className="p-3.5">
        <p className="t-title-s text-on-surface">{MFA_CHALLENGE_TEXT.stuckTitle}</p>
        <p className="t-body-s mt-1 text-on-surface-variant">{MFA_CHALLENGE_TEXT.stuckBody}</p>
      </Card>

      {/* Its own form: a nested <form> is invalid HTML, and signing out must not ride along
          on whatever the code field happens to contain. */}
      <form action={signOutAction} className="self-center">
        <Button type="submit" variant="text" size="sm">
          {MFA_CHALLENGE_TEXT.signOut}
        </Button>
      </form>
    </div>
  );
}
