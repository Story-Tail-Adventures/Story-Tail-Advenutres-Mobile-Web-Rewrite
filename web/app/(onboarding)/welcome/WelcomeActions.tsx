"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { beginOnboardingAction, skipOnboardingAction } from "./actions";
import { WELCOME_TEXT, initialWelcomeState } from "./state";

/**
 * Screen 2.1.9's footer buttons (design: C219 / M219).
 *
 * Two forms, because they are two actions. `useFormStatus` reports on its nearest ancestor
 * form, so a single form would show one pending state for whichever button was pressed —
 * and "Taking you to your dashboard…" under a button that starts the wizard would be a lie.
 */

function BeginButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" disabled={pending}>
      {WELCOME_TEXT.primaryCta}
      <Icon name="arrow_right" size={14} />
    </Button>
  );
}

function SkipButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="text"
      disabled={pending}
      aria-label={WELCOME_TEXT.secondaryCtaA11y}
    >
      {pending ? (
        <>
          <Spinner className="size-4" />
          {WELCOME_TEXT.skipPending}
        </>
      ) : (
        WELCOME_TEXT.secondaryCta
      )}
    </Button>
  );
}

export function WelcomeActions() {
  const [skipState, skipAction] = useActionState(skipOnboardingAction, initialWelcomeState);

  return (
    <div className="flex flex-col gap-3">
      {skipState.error && (
        <Alert tone="error">
          {skipState.error}{" "}
          {/* An escape hatch, because the thing that failed was the bookkeeping, not
              anything they did. Being stuck on a welcome screen is the worse outcome. */}
          <a href="/dashboard" className="font-semibold underline underline-offset-2">
            {WELCOME_TEXT.skipErrorEscape}
          </a>
          .
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
        <form action={skipAction}>
          <SkipButton />
        </form>
        <form action={beginOnboardingAction}>
          <BeginButton />
        </form>
      </div>
    </div>
  );
}
