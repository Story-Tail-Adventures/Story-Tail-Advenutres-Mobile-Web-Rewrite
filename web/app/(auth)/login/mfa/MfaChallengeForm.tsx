"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { signOutAction } from "@/lib/auth/actions";
import { MFA_CODE_LENGTH } from "@/lib/validation/mfa";
import { mfaChallengeAction } from "./actions";
import { MFA_CHALLENGE_TEXT, initialMfaChallengeState } from "./state";

/** The screen column and the form column: the legacy 14px gap between rows. */
const COLUMN_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** The note card's inside: the legacy 14px padding on MUI's CardContent. */
const NOTE_SX = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/**
 * The code input's type: mono, centred, wide tracking — the treatment C216 puts on its own
 * code field through `slotProps.input.sx`. Field owns its OutlinedInput, so this reaches the
 * <input> from a wrapper instead.
 */
const CODE_INPUT_SX = {
  "& input": { textAlign: "center", fontFamily: "mono", fontSize: 18, letterSpacing: "0.5em" },
} as const;

/**
 * Screen 2.1.7 MFA Challenge — the interactive half (design: C217 / M217).
 *
 * The prototype draws six separate boxes. This is one input styled to read the same way
 * (mono, centred, wide tracking — the treatment C216 itself uses for its code field).
 * Six inputs would break paste, which is how most people move a code across from an
 * authenticator, and would give a screen reader six unlabelled fields to announce.
 * `autoComplete="one-time-code"` is what lets iOS and Android offer the code from the
 * notification, which no amount of visual fidelity would make up for.
 */
export function MfaChallengeForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(
    mfaChallengeAction,
    initialMfaChallengeState,
  );

  return (
    <Box sx={COLUMN_SX}>
      <Box component="form" action={formAction} sx={COLUMN_SX}>
        <input type="hidden" name="next" value={next} />

        <FormError error={state.formError} />

        <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
          <Box sx={CODE_INPUT_SX}>
            <Field
              id="code"
              name="code"
              label={MFA_CHALLENGE_TEXT.codeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={MFA_CODE_LENGTH + 2}
              error={state.fieldErrors?.code?.[0]}
            />
          </Box>
        </Box>

        <SubmitButton
          label={MFA_CHALLENGE_TEXT.verify}
          pendingLabel={MFA_CHALLENGE_TEXT.pending}
        />
      </Box>

      <Card variant="flat">
        <CardContent sx={NOTE_SX}>
          <Typography component="p" variant="subtitle1">
            {MFA_CHALLENGE_TEXT.stuckTitle}
          </Typography>
          <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {MFA_CHALLENGE_TEXT.stuckBody}
          </Typography>
        </CardContent>
      </Card>

      {/* Its own form: a nested <form> is invalid HTML, and signing out must not ride along
          on whatever the code field happens to contain. */}
      <Box component="form" action={signOutAction} sx={{ alignSelf: "center" }}>
        <Button type="submit" variant="text" size="sm">
          {MFA_CHALLENGE_TEXT.signOut}
        </Button>
      </Box>
    </Box>
  );
}
