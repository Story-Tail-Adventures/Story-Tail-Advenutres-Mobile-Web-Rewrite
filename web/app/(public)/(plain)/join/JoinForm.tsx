"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DividerWithLabel } from "@/components/ui/Divider";
import { TAP_TARGET } from "@/lib/mui/sx";
import { Field } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import type { JoinIntent } from "@/lib/public/links";
import { signUpAction } from "./actions";
import { JOIN_TEXT, initialJoinState, submitLabel } from "./state";

/**
 * Screen 2.0.6 Sign-up Gate — the interactive half of the card (design: C206 / M206).
 * A client island only because `useActionState` needs one; every string lives in
 * ./state.ts and every rule in ./schema.ts + ./actions.ts.
 *
 * The prototype's Google button carries a Facebook glyph and its Apple button a generic
 * `user` icon (fidelity spec §6.5) — both dropped; the buttons are text-only like 2.1.1.
 */
export interface JoinFormProps {
  intent?: JoinIntent;
  /** Catalog slug already resolved by the page — never the raw `?trip=` parameter. */
  trip?: string;
  /** Same-origin path to continue to after sign-up (already through `safeNext`). */
  next: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
  /** `/login?next=…` built by the page. */
  signInHref: string;
  /** Guest inquiry — mailto when configured, otherwise the gate's `message` intent. */
  emailHref: string;
}

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = {
  display: "inline-flex",
  alignItems: "center",
  ...TAP_TARGET,
} as const;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" fullWidth disabled={pending}>
      {pending ? (
        <>
          <Spinner size={20} />
          {JOIN_TEXT.pending}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

function ConfirmPanel({ email, signInHref }: { email?: string; signInHref: string }) {
  return (
    <Box role="status" sx={{ display: "flex", flexDirection: "column" }}>
      <Typography component="h2" variant="h5">
        {JOIN_TEXT.confirmTitle}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.75, color: "text.secondary" }}>
        {JOIN_TEXT.confirmBefore}
        <Box component="b" sx={{ fontWeight: 600, color: "text.primary" }}>
          {email}
        </Box>
        {JOIN_TEXT.confirmAfter}
      </Typography>
      <MuiLink
        component={NextLink}
        href={signInHref}
        underline="hover"
        variant="subtitle2"
        sx={{ ...TAP_LINK, mt: 1.75, alignSelf: "flex-start" }}
      >
        {JOIN_TEXT.signIn}
      </MuiLink>
    </Box>
  );
}

export function JoinForm({
  intent,
  trip,
  next,
  googleEnabled,
  appleEnabled,
  signInHref,
  emailHref,
}: JoinFormProps) {
  const [state, formAction, isPending] = useActionState(signUpAction, initialJoinState);

  if (state.outcome === "confirm_email") {
    return <ConfirmPanel email={state.email} signInHref={signInHref} />;
  }

  const termsError = state.fieldErrors?.terms?.[0];

  return (
    <Box component="form" action={formAction} sx={{ display: "flex", flexDirection: "column" }}>
      <input type="hidden" name="intent" value={intent ?? ""} />
      <input type="hidden" name="trip" value={trip ?? ""} />
      <input type="hidden" name="next" value={next} />

      {state.formError && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone="error">
            {state.formError.message}
            {state.formError.action && (
              <>
                {" "}
                <MuiLink
                  component={NextLink}
                  href={state.formError.action.href}
                  color="inherit"
                  sx={{ fontWeight: 600 }}
                >
                  {state.formError.action.label}
                </MuiLink>
                .
              </>
            )}
          </Alert>
        </Box>
      )}

      <Stack spacing={1} sx={{ mb: 1.75 }}>
        <Button
          variant="outlined"
          size="lg"
          fullWidth
          disabled={!googleEnabled}
          title={googleEnabled ? undefined : JOIN_TEXT.socialDisabledTitle}
        >
          {JOIN_TEXT.google}
        </Button>
        <Button
          variant="outlined"
          size="lg"
          fullWidth
          disabled={!appleEnabled}
          title={appleEnabled ? undefined : JOIN_TEXT.socialDisabledTitle}
        >
          {JOIN_TEXT.apple}
        </Button>
      </Stack>

      <Box sx={{ mt: 0.5, mb: 1.5 }}>
        <DividerWithLabel label={JOIN_TEXT.divider} />
      </Box>

      <Box
        component="fieldset"
        disabled={isPending}
        sx={{ display: "contents", m: 0, p: 0, border: 0, minWidth: 0 }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
          <Field
            id="firstName"
            name="firstName"
            label={JOIN_TEXT.firstName}
            autoComplete="given-name"
            required
            defaultValue={state.firstName}
            error={state.fieldErrors?.firstName?.[0]}
          />
          <Field
            id="lastName"
            name="lastName"
            label={JOIN_TEXT.lastName}
            autoComplete="family-name"
            required
            defaultValue={state.lastName}
            error={state.fieldErrors?.lastName?.[0]}
          />
        </Box>

        <Box sx={{ mt: 1 }}>
          <Field
            id="email"
            name="email"
            label={JOIN_TEXT.email}
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            error={state.fieldErrors?.email?.[0]}
          />
        </Box>

        <Box sx={{ mt: 1 }}>
          <Field
            id="password"
            name="password"
            label={JOIN_TEXT.password}
            type="password"
            autoComplete="new-password"
            required
            hint={JOIN_TEXT.passwordHint}
            error={state.fieldErrors?.password?.[0]}
          />
        </Box>

        <Box sx={{ mt: 1.5 }}>
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
                {JOIN_TEXT.termsBefore}
                <MuiLink component={NextLink} href="/legal/terms">
                  {JOIN_TEXT.termsLink}
                </MuiLink>
                {JOIN_TEXT.termsAnd}
                <MuiLink component={NextLink} href="/legal/privacy">
                  {JOIN_TEXT.privacyLink}
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

      <Box sx={{ mt: 1.75 }}>
        <SubmitButton label={submitLabel(intent)} />
      </Box>

      {/* Two long labels side by side overflow their 328px content box at 360px: caption
          (12px) below `md`, subtitle2 (14px) from tablet up. The weight sits on the links
          themselves — a plain fontWeight here would lose to the responsive variant's own. */}
      <Box
        sx={{
          mt: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
          typography: { xs: "caption", md: "subtitle2" },
        }}
      >
        <MuiLink component={NextLink} href={signInHref} underline="hover" sx={{ ...TAP_LINK, fontWeight: 500 }}>
          {JOIN_TEXT.signIn}
        </MuiLink>
        <MuiLink
          href={emailHref}
          underline="hover"
          color="text.secondary"
          sx={{ ...TAP_LINK, fontWeight: 500, textAlign: "right" }}
        >
          {JOIN_TEXT.emailInstead}
        </MuiLink>
      </Box>
    </Box>
  );
}
