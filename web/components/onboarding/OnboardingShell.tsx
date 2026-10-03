import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import { BrandMark } from "@/components/brand/BrandMark";
import NextLink from "@/components/mui/NextLink";
import {
  WIZARD_RAIL_HEADING,
  WIZARD_STEPS,
  WIZARD_TOTAL,
  stepOverline,
} from "@/lib/onboarding/steps";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

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
 * ON MUI (step 2 of the migration). The rail is MUI's vertical Stepper, as the converted
 * artboard draws it; the layout (280px grid column from `md`, the same paddings, the same
 * mobile/desktop split) is the one this shell already had. Server Component: every prop is
 * a plain sx object, a string, or the `NextLink` client reference.
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

/** The brand-orange step overline, as every §2.1 artboard draws it. */
const OVERLINE_SX = {
  display: "block",
  color: "brand.main",
  fontWeight: 600,
  lineHeight: 1.3,
} as const;

export function OnboardingShell({
  stepIndex,
  title,
  sub,
  children,
}: OnboardingShellProps) {
  return (
    <Box
      sx={{
        display: { xs: "flex", md: "grid" },
        minHeight: "100dvh",
        flex: 1,
        flexDirection: "column",
        gridTemplateColumns: { md: "280px minmax(0, 1fr)" },
      }}
    >
      <StepRail stepIndex={stepIndex} />

      <Box
        component="main"
        sx={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          px: { xs: 2.5, md: 6 },
          pt: { xs: 2.5, md: 4.5 },
          pb: { xs: 1, md: 4.5 },
        }}
      >
        {/* The rail carries the wordmark on desktop; on mobile it has to sit inline. */}
        <Box sx={{ mb: 2.25, display: { xs: "block", md: "none" } }}>
          <BrandMark size={80} />
        </Box>

        <StepPill stepIndex={stepIndex} />

        <Typography
          component="p"
          variant="overline"
          sx={{ ...OVERLINE_SX, display: { xs: "none", md: "block" } }}
        >
          {stepOverline(stepIndex)}
        </Typography>
        <Typography
          component="h1"
          variant="h4"
          sx={{ my: 0.5, fontWeight: 700, color: "text.primary" }}
        >
          {title}
        </Typography>
        {sub && (
          <Typography
            component="p"
            variant="body1"
            sx={{
              mt: 0,
              mb: { xs: 2, md: 2.5 },
              color: "text.secondary",
              // body-s below md, body-l from it — the ramp the shell already had.
              fontSize: { xs: 13, md: 16 },
              lineHeight: { xs: 1.45, md: 1.5 },
            }}
          >
            {sub}
          </Typography>
        )}

        {children}
      </Box>
    </Box>
  );
}

/** The desktop rail: every step named, with the ones behind you ticked off. */
function StepRail({ stepIndex }: { stepIndex: number }) {
  return (
    <Box
      component="aside"
      sx={{
        display: { xs: "none", md: "block" },
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "surface.1",
        px: 3,
        py: 4,
      }}
    >
      <Box sx={{ mb: 2.5 }}>
        <BrandMark size={80} />
      </Box>
      <Typography
        component="p"
        variant="overline"
        sx={{ display: "block", mb: 1.75, lineHeight: 1.3, color: "text.secondary" }}
      >
        {WIZARD_RAIL_HEADING}
      </Typography>

      {/* A linear Stepper: `activeStep` marks everything before it completed and everything
          after it disabled, which is exactly the done / current / upcoming split. The list
          semantics stay — an <ol> of <li>, as before. */}
      <Stepper
        component="ol"
        orientation="vertical"
        activeStep={stepIndex}
        sx={{ m: 0, p: 0, listStyle: "none" }}
      >
        {WIZARD_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <Step key={step.route} component="li">
              {done ? (
                // Pattern G (§4.3): "user can jump back to completed steps". The prototype
                // draws these as inert divs, which leaves somebody who mistyped their phone
                // number on the previous step with no way back to it. A plain link around the
                // label, NOT StepButton: a StepButton child switches MUI's Stepper into
                // tab-list mode (role="tablist", role="tab", tabindex -1), which would turn
                // this ordered list of links into tabs with no panels.
                <MuiLink
                  component={NextLink}
                  href={step.route}
                  color="inherit"
                  underline="hover"
                  sx={{ display: "block" }}
                >
                  <StepLabel>
                    {step.railLabel}
                    <Box component="span" sx={VISUALLY_HIDDEN}>
                      — completed, go back to this step
                    </Box>
                  </StepLabel>
                </MuiLink>
              ) : (
                <StepLabel aria-current={current ? "step" : undefined}>
                  {step.railLabel}
                </StepLabel>
              )}
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}

/** The mobile progress bars, with the step named in the overline (design: `MStepPill`). */
function StepPill({ stepIndex }: { stepIndex: number }) {
  const step = WIZARD_STEPS[stepIndex];
  return (
    <Box sx={{ mb: 2, display: { xs: "block", md: "none" } }}>
      <Typography component="p" variant="overline" sx={OVERLINE_SX}>
        {stepOverline(stepIndex)} · {step.pillLabel.toUpperCase()}
      </Typography>
      <Box aria-hidden="true" sx={{ mt: 1, display: "flex", gap: 0.5 }}>
        {WIZARD_STEPS.map((bar, index) => (
          <Box
            key={bar.route}
            component="span"
            sx={{
              height: 4,
              flex: 1,
              borderRadius: "2px",
              bgcolor:
                index < stepIndex
                  ? "success.main"
                  : index === stepIndex
                    ? "primary.main"
                    : "surface.3",
            }}
          />
        ))}
      </Box>
      <Typography component="p" sx={VISUALLY_HIDDEN}>
        Step {stepIndex + 1} of {WIZARD_TOTAL}
      </Typography>
    </Box>
  );
}
