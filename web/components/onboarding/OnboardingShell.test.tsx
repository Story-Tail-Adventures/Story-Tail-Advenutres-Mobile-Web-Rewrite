import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithTheme } from "@/test/render";
import { WIZARD_STEPS } from "@/lib/onboarding/steps";
import { OnboardingShell } from "./OnboardingShell";

/**
 * The step rail is an ordered list: completed steps are LINKS back (Pattern G), the current
 * step is marked, the rest are plain text. MUI's StepButton would turn it into a tab list
 * (role="tablist" / "tab", tabindex -1) with no panels, which a review caught; this pins the
 * list-of-links shape.
 */
describe("OnboardingShell step rail", () => {
  it("is a list, not a tab list, with links back to completed steps", () => {
    const { container } = renderWithTheme(
      <OnboardingShell stepIndex={2} title="How do you travel?">
        <p>body</p>
      </OnboardingShell>,
    );
    expect(container.querySelector('[role="tablist"], [role="tab"]')).toBeNull();

    const rail = container.querySelector("ol")!;
    expect(within(rail).getAllByRole("listitem")).toHaveLength(WIZARD_STEPS.length);

    const back = within(rail).getAllByRole("link");
    expect(back.map((a) => a.getAttribute("href"))).toEqual([
      WIZARD_STEPS[0].route,
      WIZARD_STEPS[1].route,
    ]);
    expect(back[1]).toHaveAccessibleName(
      `${WIZARD_STEPS[1].railLabel} — completed, go back to this step`,
    );

    const current = rail.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent(WIZARD_STEPS[2].railLabel);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
