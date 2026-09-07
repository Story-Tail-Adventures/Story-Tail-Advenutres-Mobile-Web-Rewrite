/**
 * The chrome every onboarding step wears — Screen Inventory §2.1.9–§2.1.14, Pattern G.
 *
 * Two progress indicators, not one, because the artboards genuinely differ: desktop
 * (`OnboardingShell` in design/source-prototype/screens/client-auth.jsx) puts a 280px rail
 * of named steps down the left; mobile (`MOnboardShell` / `MStepPill` in
 * client-auth-mobile.jsx) has no room for it and shows six progress bars under an overline
 * instead. Both are rendered and CSS picks; they read the same [WIZARD_STEPS] list, so a
 * step added to one is added to the other.
 *
 * The actions are NOT here. They belong inside the `<form>` that owns them — see
 * [OnboardingActions] — and a shell that rendered them would put the buttons outside it.
 */
export interface OnboardingShellProps {
    /** 0-based index into [WIZARD_STEPS]. 2.1.9 Welcome is 0. */
    stepIndex: number;
    title: string;
    sub?: string;
    children: React.ReactNode;
}
export declare function OnboardingShell({ stepIndex, title, sub, children, }: OnboardingShellProps): import("react").JSX.Element;
