"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { beginOnboardingAction, skipOnboardingAction } from "./actions";
import { WELCOME_TEXT, initialWelcomeState } from "./state";

/**
 * Screen 2.1.9's footer buttons (design: C219 / M219).
 *
 * Two forms, because they are two actions. `useFormStatus` reports on its nearest ancestor
 * form, so a single form would show one pending state for whichever button was pressed —
 * and "Taking you to your dashboard…" under a button that starts the wizard would be a lie.
 */

function BeginButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" disabled={pending}>
      {WELCOME_TEXT.primaryCta}
      <Icon name="arrow_right" size={14} />
    </Button>
  );
}

function SkipButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="text"
      disabled={pending}
      aria-label={WELCOME_TEXT.secondaryCtaA11y}
    >
      {pending ? (
        <>
          <Spinner />
          {WELCOME_TEXT.skipPending}
        </>
      ) : (
        WELCOME_TEXT.secondaryCta
      )}
    </Button>
  );
}

export function WelcomeActions() {
  const [skipState, skipAction] = useActionState(skipOnboardingAction, initialWelcomeState);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {skipState.error && (
        <Alert tone="error">
          {skipState.error}{" "}
          {/* An escape hatch, because the thing that failed was the bookkeeping, not
              anything they did. Being stuck on a welcome screen is the worse outcome. A
              plain <a>, as before: a full navigation out of the wizard. */}
          <MuiLink
            href="/dashboard"
            color="inherit"
            underline="always"
            sx={{ fontWeight: 600, textUnderlineOffset: 2 }}
          >
            {WELCOME_TEXT.skipErrorEscape}
          </MuiLink>
          .
        </Alert>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column-reverse", sm: "row" },
          justifyContent: { sm: "flex-end" },
          gap: { xs: 1.25, sm: 1.5 },
        }}
      >
        <form action={skipAction}>
          <SkipButton />
        </form>
        <form action={beginOnboardingAction}>
          <BeginButton />
        </form>
      </Box>
    </Box>
  );
}
