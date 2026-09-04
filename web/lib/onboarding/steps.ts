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

export const WIZARD_STEPS: readonly WizardStep[] = [
  { slug: null, route: "/welcome", railLabel: "Welcome", pillLabel: "Welcome" },
  {
    slug: "profile",
    route: "/onboarding/profile",
    railLabel: "Profile basics",
    pillLabel: "Profile",
  },
  {
    slug: "preferences",
    route: "/onboarding/preferences",
    railLabel: "Travel preferences",
    pillLabel: "Preferences",
  },
  {
    slug: "companions",
    route: "/onboarding/companions",
    railLabel: "Travel companions",
    pillLabel: "Companions",
  },
  {
    slug: "connect",
    route: "/onboarding/connect",
    railLabel: "Link existing trips",
    pillLabel: "Existing trips",
  },
  {
    slug: "complete",
    route: "/onboarding/complete",
    railLabel: "All set!",
    pillLabel: "All set",
  },
];

export const WIZARD_TOTAL = WIZARD_STEPS.length;

/** The rail heading above the step list (design: `OnboardingShell`). */
export const WIZARD_RAIL_HEADING = "WELCOME ABOARD";

/** Where a cursor value belongs, for the route gate. Excludes the null-slug cover page. */
export const WIZARD_ROUTE_BY_SLUG: Record<string, string> = Object.fromEntries(
  WIZARD_STEPS.filter((step) => step.slug !== null).map((step) => [step.slug, step.route]),
);

/**
 * `STEP 02 OF 06`.
 *
 * Zero-padded and 1-based, matching both artboards. The index is 0-based because it is an
 * index into [WIZARD_STEPS]; the label is 1-based because it is for a person.
 */
export function stepOverline(index: number): string {
  const shown = String(index + 1).padStart(2, "0");
  return `STEP ${shown} OF ${String(WIZARD_TOTAL).padStart(2, "0")}`;
}
