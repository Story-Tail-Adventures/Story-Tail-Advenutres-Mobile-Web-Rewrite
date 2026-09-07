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
export declare function OnboardingActions({ formId, saving, disabled, primaryLabel, pendingLabel, secondaryLabel, secondaryA11yLabel, secondaryPendingLabel, skipAction, backHref, backLabel, }: OnboardingActionsProps): import("react").JSX.Element;
