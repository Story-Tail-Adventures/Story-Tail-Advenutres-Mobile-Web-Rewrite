/**
 * The six screens of the client onboarding wizard, in order.
 *
 * Screen Inventory §2.1.9 through §2.1.14. One list, because three things have to agree
 * about it and they are in three different places: the left rail on desktop
 * (`OnboardingShell` in the prototype), the progress bars on mobile (`MStepPill`), and the
 * `platform_user.onboarding_step` cursor that decides where an abandoned wizard resumes.
 *
 * The cursor has five values and the wizard has six screens, and that is not an
 * off-by-one. 2.1.9 Welcome is the cover page: reaching it is the absence of progress, so
 * it is `slug: null` — the same null the column holds before anybody has started.
 * `ONBOARDING_STEPS` in supabase/functions/_shared/onboarding.ts is the server's copy of
 * the same five, and the CHECK constraint in 20260903230000_onboarding_step.sql is what
 * refuses a typo.
 */
export interface WizardStep {
    /** The `platform_user.onboarding_step` value, or null for the cover page. */
    slug: string | null;
    route: string;
    /** Desktop left-rail label (design: `OnboardingShell`). */
    railLabel: string;
    /** Mobile step-pill label — shorter, because it sits in an overline (design: `MStepPill`). */
    pillLabel: string;
}
export declare const WIZARD_STEPS: readonly WizardStep[];
export declare const WIZARD_TOTAL: number;
/** The rail heading above the step list (design: `OnboardingShell`). */
export declare const WIZARD_RAIL_HEADING = "WELCOME ABOARD";
/**
 * The label on every step's Back affordance.
 *
 * Chrome copy rather than screen copy: it belongs to the wizard, not to whichever step you
 * happen to be standing on, and six copies of the word "Back" is six chances to disagree.
 */
export declare const WIZARD_BACK_LABEL = "Back";
/**
 * Where a cursor slug sits in the wizard.
 *
 * Every step needs this number twice — the page hands it to the shell, and the form hands
 * it to `previousRoute` — and the two must never disagree. It is derived rather than
 * written down in each screen, and it lives HERE rather than being exported from the
 * screen's own form component: a `"use client"` module's exports reach a server component
 * as client references, so a number exported from one arrives as an object and the shell
 * indexes past the end of the list. That failure is a 500 on the step, not a type error.
 */
export declare function wizardStepIndex(slug: string): number;
/**
 * The step before this one, or null on the cover page.
 *
 * Pattern G (§4.3) asks for a route back to a completed step. Going back is NAVIGATION and
 * never moves the cursor: rewinding it would mean an abandoned wizard resumed at a step the
 * traveler had already worked past.
 */
export declare function previousRoute(stepIndex: number): string | undefined;
/** Where a cursor value belongs, for the route gate. Excludes the null-slug cover page. */
export declare const WIZARD_ROUTE_BY_SLUG: Record<string, string>;
/**
 * `STEP 02 OF 06`.
 *
 * Zero-padded and 1-based, matching both artboards. The index is 0-based because it is an
 * index into [WIZARD_STEPS]; the label is 1-based because it is for a person.
 */
export declare function stepOverline(index: number): string;
