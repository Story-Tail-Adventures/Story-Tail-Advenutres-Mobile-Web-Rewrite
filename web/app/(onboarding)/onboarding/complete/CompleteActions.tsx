"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { finishOnboardingAction } from "./actions";
import { COMPLETE_TEXT, initialCompleteState } from "./state";

/**
 * The last button in the wizard.
 *
 * One action, so `useActionState`'s own pending flag is enough — no second form and no
 * `useFormStatus`, unlike every step before this one, because there is nothing here to be
 * confused with.
 *
 * The prototype's second CTA, "Fine-tune notifications →", is not built: see the note in
 * state.ts and the deferral recorded in Screen-Inventory §2.1.14.
 */
export function CompleteActions() {
  const [state, formAction, finishing] = useActionState(
    finishOnboardingAction,
    initialCompleteState,
  );

  return (
    <div className="flex flex-col gap-3">
      {state.error && (
        <Alert tone="error">
          {state.error}{" "}
          {/* An escape hatch, because what failed is bookkeeping rather than anything they
              did. Being held on a screen that says "that's everything" is the worse
              outcome — they will simply meet the wizard again, which is the same failure
              wearing a friendlier face. */}
          <a
            href="/dashboard"
            className="font-semibold underline underline-offset-2"
          >
            {COMPLETE_TEXT.errorEscape}
          </a>
          .
        </Alert>
      )}

      <form action={formAction}>
        <Button
          type="submit"
          variant="filled"
          size="lg"
          disabled={finishing}
          fullWidth
          className="md:w-auto"
        >
          {finishing ? (
            <>
              <Spinner className="size-4" />
              {COMPLETE_TEXT.pending}
            </>
          ) : (
            <>
              {COMPLETE_TEXT.primaryCta}
              <Icon name="arrow_right" size={14} />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
