"use client";

import Link from "next/link";
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
 * Back is a link, not an action: going back is navigation, and moving the wizard cursor
 * backwards would mean an abandoned wizard resumed at the step somebody had already left.
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
  /**
   * Held back for a reason that is not a save in flight — 2.1.12 uses it while a traveler's
   * form is open, because leaving the step then would throw away what is in it. Separate
   * from `saving` so the button stays readable rather than claiming to be saving.
   */
  disabled?: boolean;
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
  /**
   * Where "Back" goes, or nothing on the first step.
   *
   * Pattern G (§4.3) asks for Back and Next persistent at the bottom on mobile. Neither
   * artboard drew it.
   */
  backHref?: string;
  backLabel: string;
}

export function OnboardingActions({
  formId,
  saving,
  disabled = false,
  primaryLabel,
  pendingLabel,
  secondaryLabel,
  secondaryA11yLabel,
  secondaryPendingLabel,
  skipAction,
  backHref,
  backLabel,
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
        disabled={saving || disabled}
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

      <div className="flex items-center justify-between gap-2.5">
        {backHref ? (
          // Inert while a save is in flight, matching the other two controls. A `<Link>`
          // has no `disabled`, so leaving as it stands would make Back the one way to
          // navigate away mid-submit — the surprising exception rather than the rule.
          <Link
            href={backHref}
            className={
              saving || disabled
                ? "btn btn-text pointer-events-none opacity-60"
                : "btn btn-text"
            }
            aria-disabled={saving || disabled || undefined}
            tabIndex={saving || disabled ? -1 : undefined}
          >
            <Icon name="arrow_left" size={14} />
            {backLabel}
          </Link>
        ) : (
          // Holds the row's left edge so the skip stays on the right of it either way.
          <span />
        )}

        {skipAction && (
          // `contents` so the form lays nothing out and the button is a direct child of
          // this row, exactly as it would be without the wrapper.
          <form action={skipAction} className="contents">
            <SkipButton
              label={secondaryLabel}
              pendingLabel={secondaryPendingLabel}
              a11yLabel={secondaryA11yLabel}
              disabled={saving || disabled}
            />
          </form>
        )}
      </div>
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
