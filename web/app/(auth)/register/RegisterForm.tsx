"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { FormError } from "@/components/auth/FormError";
import { PasswordStrengthField } from "@/components/auth/PasswordStrength";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Card } from "@/components/ui/Card";
import { DividerWithLabel } from "@/components/ui/Divider";
import { Field } from "@/components/ui/Field";
import { TAP_TARGET } from "@/lib/mui/sx";
import { registerAction } from "./actions";
import { REGISTER_TEXT, initialRegisterState } from "./state";

/** The form column: the legacy 14px gap between rows. */
const FORM_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** The note card's inside: the legacy 14px padding on MUI's CardContent. */
const NOTE_SX = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

/**
 * Screen 2.1.2 Registration — the interactive half (design: C212 / M212).
 *
 * The prototype's social buttons carry mismatched glyphs (a Facebook mark on the Google
 * button, a generic user icon on Apple); both are dropped here, text-only, matching 2.1.1.
 */
export function RegisterForm({
  next,
  googleEnabled,
  appleEnabled,
}: {
  next: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(registerAction, initialRegisterState);

  if (state.outcome === "confirm_email") {
    return (
      <Box role="status" sx={{ display: "flex", flexDirection: "column" }}>
        <Typography component="h2" variant="h5">
          {REGISTER_TEXT.confirmTitle}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
          {REGISTER_TEXT.confirmBefore}
          <Box component="b" sx={{ fontWeight: 600, color: "text.primary" }}>
            {state.email}
          </Box>
          {REGISTER_TEXT.confirmAfter}
        </Typography>
        <Box sx={{ mt: 1.75 }}>
          <Card variant="flat">
            <CardContent sx={NOTE_SX}>
              <Typography component="p" variant="subtitle1">
                {REGISTER_TEXT.whyTitle}
              </Typography>
              <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                {REGISTER_TEXT.whyBody}
              </Typography>
            </CardContent>
          </Card>
        </Box>
        <MuiLink
          component={NextLink}
          href="/verify-email"
          variant="subtitle2"
          sx={{ ...TAP_LINK, mt: 1.75, alignSelf: "flex-start" }}
        >
          {REGISTER_TEXT.verifyCta}
        </MuiLink>
      </Box>
    );
  }

  const termsError = state.fieldErrors?.terms?.[0];

  return (
    <Box component="form" action={formAction} sx={FORM_SX}>
      <input type="hidden" name="next" value={next} />

      <FormError error={state.formError} />

      {/* These submit this same form to signInWithProviderAction — see SocialButtons.
          Inside a disabled fieldset because they are submit buttons on a form that may
          already be submitting: left live, a click during sign-up starts a second,
          concurrent submission of the same form. `contents` keeps the flex gap. */}
      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
        <SocialButtons
          googleEnabled={googleEnabled}
          appleEnabled={appleEnabled}
          googleLabel={REGISTER_TEXT.google}
          appleLabel={REGISTER_TEXT.apple}
          disabledTitle={REGISTER_TEXT.socialDisabledTitle}
        />
      </Box>

      <DividerWithLabel label={REGISTER_TEXT.divider} />

      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1.25 }}>
          <Field
            id="firstName"
            name="firstName"
            label={REGISTER_TEXT.firstName}
            autoComplete="given-name"
            autoFocus
            required
            defaultValue={state.firstName}
            error={state.fieldErrors?.firstName?.[0]}
          />
          <Field
            id="lastName"
            name="lastName"
            label={REGISTER_TEXT.lastName}
            autoComplete="family-name"
            required
            defaultValue={state.lastName}
            error={state.fieldErrors?.lastName?.[0]}
          />
        </Box>

        <Field
          id="email"
          name="email"
          label={REGISTER_TEXT.email}
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />

        <PasswordStrengthField
          id="password"
          name="password"
          label={REGISTER_TEXT.password}
          type="password"
          autoComplete="new-password"
          required
          idleHint={REGISTER_TEXT.passwordHint}
          error={state.fieldErrors?.password?.[0]}
        />

        <Field
          id="confirmPassword"
          name="confirmPassword"
          label={REGISTER_TEXT.confirm}
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmPassword?.[0]}
        />

        <Box>
          {/* A real checkbox (MUI's Checkbox wraps a native input) so the form posts `terms`
              with no JavaScript involved; the aria wiring lands on that input. */}
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Checkbox
                id="terms"
                name="terms"
                size="small"
                slotProps={{
                  input: {
                    // On the input, not the Checkbox prop: FormControlLabel reads the prop and
                    // would add a " *" the legacy terms row never had.
                    required: true,
                    "aria-invalid": termsError ? true : undefined,
                    "aria-describedby": termsError ? "terms-error" : undefined,
                  },
                }}
              />
            }
            label={
              <>
                {REGISTER_TEXT.termsBefore}
                <MuiLink component={NextLink} href="/legal/terms">
                  {REGISTER_TEXT.termsLink}
                </MuiLink>
                {REGISTER_TEXT.termsAnd}
                <MuiLink component={NextLink} href="/legal/privacy">
                  {REGISTER_TEXT.privacyLink}
                </MuiLink>
              </>
            }
            slotProps={{ typography: { variant: "body2", sx: { color: "text.secondary" } } }}
          />
          {termsError && (
            <FormHelperText id="terms-error" error sx={{ mx: 0, mt: 0.75 }}>
              {termsError}
            </FormHelperText>
          )}
        </Box>
      </Box>

      <SubmitButton label={REGISTER_TEXT.submit} pendingLabel={REGISTER_TEXT.pending} />
    </Box>
  );
}
