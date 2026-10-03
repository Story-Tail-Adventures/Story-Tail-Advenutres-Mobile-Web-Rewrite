"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import { OnboardingActions } from "@/components/onboarding/OnboardingActions";
import { Field } from "@/components/ui/Field";
import { FONT } from "@/lib/mui/tokens";
import {
  WIZARD_BACK_LABEL,
  previousRoute,
  wizardStepIndex,
} from "@/lib/onboarding/steps";
import { connectAction, skipConnectAction } from "./actions";
import { CONNECT_TEXT, initialConnectState } from "./state";

/**
 * Screen 2.1.13's code field (design: `C2113_ConnectAgent` / `M2113_ConnectAgent`).
 *
 * The primary button says two different things because it does two different things: with
 * a code in the box it redeems one, and empty it simply carries on. A single fixed
 * "Save & continue" would be a small lie in whichever state it was wrong for.
 */

const STEP_INDEX = wizardStepIndex("connect");
const FORM_ID = "connect-form";

export function ConnectForm() {
  const [state, formAction, connecting] = useActionState(
    connectAction,
    initialConnectState,
  );
  // Only to choose the button's label — the value itself is uncontrolled and the browser
  // owns it, so a rejected submit leaves what was typed exactly where it was.
  const [hasCode, setHasCode] = useState((state.code ?? "").trim() !== "");

  return (
    <>
      <form id={FORM_ID} action={formAction} noValidate>
        <Box
          component="fieldset"
          disabled={connecting}
          sx={{ m: 0, p: 0, border: 0, minWidth: 0, maxWidth: { md: 384 } }}
        >
          <Field
            id="code"
            name="code"
            label={CONNECT_TEXT.fieldLabel}
            hint={CONNECT_TEXT.fieldHelp}
            placeholder={CONNECT_TEXT.placeholder}
            // A bearer token for somebody's itinerary: never remembered by the browser,
            // never corrected by a spell checker, never auto-capitalised into something else.
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            // Monospace, as the artboard draws the code box: a code is read letter by
            // letter, and a fixed pitch keeps "0" and "O" apart. Reaches the <input>.
            style={{ fontFamily: FONT.mono }}
            defaultValue={state.code ?? ""}
            // The refusal is about THIS field — there is only one — so it marks the input
            // invalid too. The Alert above announces it once; this is what a screen-reader
            // user hears when they tab back into the box to correct it.
            error={state.formError}
            onChange={(event) => setHasCode(event.target.value.trim() !== "")}
          />
        </Box>
      </form>

      <OnboardingActions
        formId={FORM_ID}
        saving={connecting}
        primaryLabel={
          hasCode ? CONNECT_TEXT.primaryCta : CONNECT_TEXT.primaryCtaEmpty
        }
        pendingLabel={CONNECT_TEXT.pending}
        secondaryLabel={CONNECT_TEXT.secondaryCta}
        secondaryA11yLabel={CONNECT_TEXT.secondaryCtaA11y}
        secondaryPendingLabel={CONNECT_TEXT.secondaryPending}
        skipAction={skipConnectAction}
        backHref={previousRoute(STEP_INDEX)}
        backLabel={WIZARD_BACK_LABEL}
      />
    </>
  );
}
