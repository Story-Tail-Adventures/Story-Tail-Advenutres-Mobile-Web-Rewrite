import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  WIZARD_RAIL_HEADING,
  WIZARD_STEPS,
  WIZARD_TOTAL,
  stepOverline,
} from "@/lib/onboarding/steps";

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

export function OnboardingShell({
  stepIndex,
  title,
  sub,
  children,
}: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:grid md:grid-cols-[280px_1fr]">
      <StepRail stepIndex={stepIndex} />

      <main className="flex flex-1 flex-col px-5 pt-5 pb-2 md:px-12 md:py-9">
        {/* The rail carries the wordmark on desktop; on mobile it has to sit inline. */}
        <div className="mb-4.5 md:hidden">
          <BrandWordmark size={22} />
        </div>

        <StepPill stepIndex={stepIndex} />

        <p className="t-label-s hidden text-brand-orange md:block">
          {stepOverline(stepIndex)}
        </p>
        <h1 className="t-headline mt-1 mb-1 text-on-surface">{title}</h1>
        {sub && (
          <p className="t-body-s mt-0 mb-4 text-on-surface-variant md:t-body-l md:mb-5">
            {sub}
          </p>
        )}

        {children}
      </main>
    </div>
  );
}

/** The desktop rail: every step named, with the ones behind you ticked off. */
function StepRail({ stepIndex }: { stepIndex: number }) {
  return (
    <aside className="hidden border-r border-outline-variant bg-surface-1 px-6 py-8 md:block">
      <div className="mb-7">
        <BrandWordmark size={28} />
      </div>
      <p className="t-label mb-3.5 text-on-surface-variant">
        {WIZARD_RAIL_HEADING}
      </p>

      <ol className="m-0 list-none p-0">
        {WIZARD_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          const marker = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "t-label-s inline-flex size-5.5 shrink-0 items-center justify-center",
                  "rounded-full tracking-normal text-white",
                  done ? "bg-success" : current ? "bg-primary" : "bg-surface-3",
                )}
              >
                {done ? (
                  <Icon name="check" size={12} strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "t-body-s",
                  current
                    ? "font-semibold text-on-surface"
                    : "font-medium text-on-surface-variant",
                )}
              >
                {step.railLabel}
              </span>
            </>
          );

          return (
            <li key={step.route}>
              {done ? (
                // Pattern G (§4.3): "user can jump back to completed steps". The prototype
                // draws these as inert divs, which leaves somebody who mistyped their phone
                // number on the previous step with no way back to it.
                <Link
                  href={step.route}
                  className="flex items-center gap-2.5 rounded-sm py-2 hover:underline"
                >
                  {marker}
                  <span className="sr-only">
                    — completed, go back to this step
                  </span>
                </Link>
              ) : (
                <div
                  className="flex items-center gap-2.5 py-2"
                  aria-current={current ? "step" : undefined}
                >
                  {marker}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** The mobile progress bars, with the step named in the overline (design: `MStepPill`). */
function StepPill({ stepIndex }: { stepIndex: number }) {
  const step = WIZARD_STEPS[stepIndex];
  return (
    <div className="mb-4 md:hidden">
      <p className="t-label-s text-brand-orange">
        {stepOverline(stepIndex)} · {step.pillLabel.toUpperCase()}
      </p>
      <div aria-hidden="true" className="mt-2 flex gap-1">
        {WIZARD_STEPS.map((bar, index) => (
          <span
            key={bar.route}
            className={cn(
              "h-1 flex-1 rounded-xs",
              index < stepIndex
                ? "bg-success"
                : index === stepIndex
                  ? "bg-primary"
                  : "bg-surface-3",
            )}
          />
        ))}
      </div>
      <p className="sr-only">
        Step {stepIndex + 1} of {WIZARD_TOTAL}
      </p>
    </div>
  );
}
