"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The bottom of every wizard step: "Save & continue" and "Skip for now".
 *
 * Two shapes, one markup. Desktop (design: `OnboardingShell`) puts the skip on the left and
 * the primary on the right of a row. Mobile (`MStickyBottom`) stacks them full-width in a
 * bar pinned to the bottom of the viewport, so the primary action stays reachable however
 * long the form gets. `flex-row-reverse` at `md` is what puts the primary — first in the
 * DOM, so first in the tab order and first for a screen reader — on the right.
 *
 * TWO ACTIONS, TWO FORMS, and the reason is honesty about pending state. `useFormStatus`
 * reports on the nearest ancestor form, so one form holding both buttons would show
 * "Saving your details…" under a button that is skipping the step. So the skip gets its own
 * `<form>` — `display: contents`, so it takes part in no layout — and the primary reaches
 * the real form from outside it through the HTML `form` attribute, with its pending state
 * coming from `useActionState` in the parent.
 */

export interface OnboardingActionsProps {
  /** The `id` of the `<form>` the primary button submits. */
  formId: string;
  /** From `useActionState`, so the label is right for THIS action and not the other one. */
  saving: boolean;
  primaryLabel: string;
  pendingLabel: string;
  secondaryLabel: string;
  /** Used when "Skip for now" on its own would not say skip what. */
  secondaryA11yLabel?: string;
  secondaryPendingLabel: string;
  /**
   * The skip path — a different server action from the save, and one that always
   * redirects. Omitted on a step with nothing to skip.
   */
  skipAction?: (formData: FormData) => void | Promise<void>;
}

export function OnboardingActions({
  formId,
  saving,
  primaryLabel,
  pendingLabel,
  secondaryLabel,
  secondaryA11yLabel,
  secondaryPendingLabel,
  skipAction,
}: OnboardingActionsProps) {
  return (
    <div
      className={[
        // Mobile: a sticky bar with its own surface, so the form scrolls under it.
        "sticky bottom-0 -mx-5 mt-6 flex flex-col gap-1.5 border-t border-outline-variant",
        "bg-surface-1 px-5 pt-3 pb-5.5",
        // Desktop: an ordinary row at the end of the page.
        "md:static md:mx-0 md:flex-row-reverse md:justify-between md:gap-2.5",
        "md:border-0 md:bg-transparent md:p-0",
      ].join(" ")}
    >
      <Button
        type="submit"
        form={formId}
        variant="filled"
        size="lg"
        disabled={saving}
        fullWidth
        className="md:w-auto"
      >
        {saving ? (
          <>
            <Spinner className="size-4" />
            {pendingLabel}
          </>
        ) : (
          <>
            {primaryLabel}
            <Icon name="arrow_right" size={14} />
          </>
        )}
      </Button>

      {skipAction && (
        // `contents` so the form itself lays nothing out and the button is a direct flex
        // child of the bar, exactly as it would be without the wrapper.
        <form action={skipAction} className="contents">
          <SkipButton
            label={secondaryLabel}
            pendingLabel={secondaryPendingLabel}
            a11yLabel={secondaryA11yLabel}
            disabled={saving}
          />
        </form>
      )}
    </div>
  );
}

function SkipButton({
  label,
  pendingLabel,
  a11yLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  a11yLabel?: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="text"
      disabled={pending || disabled}
      fullWidth
      className="md:w-auto"
      aria-label={a11yLabel}
    >
      {pending ? (
        <>
          <Spinner className="size-4" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
