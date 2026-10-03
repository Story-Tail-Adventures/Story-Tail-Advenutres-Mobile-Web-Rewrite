"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { finishOnboardingAction } from "./actions";
import { COMPLETE_TEXT, initialCompleteState } from "./state";

/**
 * The last button in the wizard.
 *
 * One action, so `useActionState`'s own pending flag is enough — no second form and no
 * `useFormStatus`, unlike every step before this one, because there is nothing here to be
 * confused with.
 *
 * The prototype's second CTA, "Fine-tune notifications →", is not built: see the note in
 * state.ts and the deferral recorded in Screen-Inventory §2.1.14.
 */
export function CompleteActions() {
  const [state, formAction, finishing] = useActionState(
    finishOnboardingAction,
    initialCompleteState,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {state.error && (
        <Alert tone="error">
          {state.error}{" "}
          {/* An escape hatch, because what failed is bookkeeping rather than anything they
              did. Being held on a screen that says "that's everything" is the worse
              outcome — they will simply meet the wizard again, which is the same failure
              wearing a friendlier face. A plain <a>, as before. */}
          <MuiLink
            href="/dashboard"
            color="inherit"
            underline="always"
            sx={{ fontWeight: 600, textUnderlineOffset: 2 }}
          >
            {COMPLETE_TEXT.errorEscape}
          </MuiLink>
          .
        </Alert>
      )}

      {/* A flex column: the button stretches to full width on a phone and sits at its own
          width from `md`, with nothing to undo at the breakpoint. */}
      <Box
        component="form"
        action={formAction}
        sx={{ display: "flex", flexDirection: "column", alignItems: { md: "flex-start" } }}
      >
        <Button type="submit" variant="filled" size="lg" disabled={finishing}>
          {finishing ? (
            <>
              <Spinner />
              {COMPLETE_TEXT.pending}
            </>
          ) : (
            <>
              {COMPLETE_TEXT.primaryCta}
              <Icon name="arrow_right" size={14} />
            </>
          )}
        </Button>
      </Box>
    </Box>
  );
}
