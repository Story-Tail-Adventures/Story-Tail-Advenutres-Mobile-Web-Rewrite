"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The bottom of every wizard step: "Save & continue" and "Skip for now".
 *
 * Two shapes, one markup. Desktop (design: `OnboardingShell`) puts the skip on the left and
 * the primary on the right of a row. Mobile (`MStickyBottom`) stacks them full-width in a
 * bar pinned to the bottom of the viewport, so the primary action stays reachable however
 * long the form gets. `row-reverse` at `md` is what puts the primary — first in the DOM, so
 * first in the tab order and first for a screen reader — on the right.
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

/**
 * The bar. Below `md` it is sticky with its own surface, bleeding into the shell's 20px
 * gutters so the form scrolls under it; from `md` it is an ordinary row at the end of the
 * page. The column direction is what makes the primary button full width on a phone: a flex
 * item stretches across the cross axis, so no `fullWidth` is needed and nothing has to be
 * undone at `md`.
 */
const BAR_SX = {
  display: "flex",
  mt: 3,
  position: { xs: "sticky", md: "static" },
  bottom: 0,
  mx: { xs: -2.5, md: 0 },
  flexDirection: { xs: "column", md: "row-reverse" },
  justifyContent: { md: "space-between" },
  gap: { xs: 0.75, md: 1.25 },
  borderTop: { xs: 1, md: 0 },
  borderColor: "divider",
  bgcolor: { xs: "surface.1", md: "transparent" },
  px: { xs: 2.5, md: 0 },
  pt: { xs: 1.5, md: 0 },
  pb: { xs: 2.75, md: 0 },
} as const;

/** The legacy `.btn.btn-text` box on MUI's text button, for the Back link. */
const TEXT_BUTTON_SX = { minHeight: 40, px: "12px", gap: 1, whiteSpace: "nowrap" } as const;

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
  const held = saving || disabled;

  return (
    <Box sx={BAR_SX}>
      <Button
        type="submit"
        form={formId}
        variant="filled"
        size="lg"
        disabled={held}
      >
        {saving ? (
          <>
            <Spinner />
            {pendingLabel}
          </>
        ) : (
          <>
            {primaryLabel}
            <Icon name="arrow_right" size={14} />
          </>
        )}
      </Button>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.25 }}>
        {backHref ? (
          // Inert while a save is in flight, matching the other two controls. A `<Link>`
          // has no `disabled`, so leaving as it stands would make Back the one way to
          // navigate away mid-submit — the surprising exception rather than the rule.
          <MuiButton
            component={Link}
            href={backHref}
            variant="text"
            color="primary"
            sx={{ ...TEXT_BUTTON_SX, ...(held && { pointerEvents: "none", opacity: 0.6 }) }}
            aria-disabled={held || undefined}
            tabIndex={held ? -1 : undefined}
          >
            <Icon name="arrow_left" size={14} />
            {backLabel}
          </MuiButton>
        ) : (
          // Holds the row's left edge so the skip stays on the right of it either way.
          <span />
        )}

        {skipAction && (
          // `contents` so the form lays nothing out and the button is a direct child of
          // this row, exactly as it would be without the wrapper.
          <Box component="form" action={skipAction} sx={{ display: "contents" }}>
            <SkipButton
              label={secondaryLabel}
              pendingLabel={secondaryPendingLabel}
              a11yLabel={secondaryA11yLabel}
              disabled={held}
            />
          </Box>
        )}
      </Box>
    </Box>
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
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
