"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { TAP_TARGET } from "@/lib/mui/sx";
import { requestPasswordResetAction } from "./actions";
import { FORGOT_TEXT, initialForgotPasswordState } from "./state";

/** The form column: the legacy 14px gap between rows. */
const FORM_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** The note card's inside: the legacy 14px padding on MUI's CardContent. */
const NOTE_SX = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

/**
 * Screen 2.1.4 Forgot Password — the interactive half (design: C214 / M214).
 *
 * A client island only because `useActionState` needs one; every string is in ./state.ts
 * and every rule in ./actions.ts.
 */
export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialForgotPasswordState,
  );

  if (state.outcome === "sent") {
    return (
      <Box role="status" sx={{ display: "flex", flexDirection: "column" }}>
        <Typography component="h2" variant="h5">
          {FORGOT_TEXT.sentTitle}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
          {FORGOT_TEXT.sentBefore}
          <Box component="b" sx={{ fontWeight: 600, color: "text.primary" }}>
            {state.email}
          </Box>
          {FORGOT_TEXT.sentAfter}
        </Typography>
        <Box sx={{ mt: 1.75 }}>
          <Card variant="flat">
            <CardContent sx={NOTE_SX}>
              <Typography component="p" variant="caption" color="text.secondary">
                {FORGOT_TEXT.help}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="form" action={formAction} sx={FORM_SX}>
      <FormError error={state.formError} />

      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
        <Field
          id="email"
          name="email"
          label={FORGOT_TEXT.email}
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />
      </Box>

      <SubmitButton label={FORGOT_TEXT.submit} pendingLabel={FORGOT_TEXT.pending} />

      <Typography component="p" variant="caption" color="text.secondary">
        {FORGOT_TEXT.help}
      </Typography>

      <MuiLink
        component={NextLink}
        href="/login"
        variant="subtitle2"
        sx={{ ...TAP_LINK, alignSelf: "flex-start" }}
      >
        {FORGOT_TEXT.backToSignIn}
      </MuiLink>
    </Box>
  );
}
