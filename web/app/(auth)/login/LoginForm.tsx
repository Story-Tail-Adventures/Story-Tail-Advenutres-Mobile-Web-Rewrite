"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import type { MappedAuthError } from "@/lib/auth-errors";
import { FormError } from "@/components/auth/FormError";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Field } from "@/components/ui/Field";
import { DividerWithLabel } from "@/components/ui/Divider";
import { signInAction } from "./actions";
import { initialLoginState } from "./state";

/** The form column: the legacy 14px gap between rows. */
const FORM_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

export function LoginForm({
  next,
  googleEnabled,
  appleEnabled,
  initialError,
}: {
  next?: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
  /** From `?error=`, so a failed OAuth start says something. */
  initialError?: MappedAuthError;
}) {
  // Seeded, not held separately: `useActionState` replaces the whole state on the first
  // submit, so the URL error shows on arrival and a real submit error supersedes it.
  // A second piece of state would leave both on screen at once.
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialError ? { ...initialLoginState, formError: initialError } : initialLoginState,
  );

  const socialTitle = "Social sign-in isn't switched on yet — use your email below.";

  return (
    <Box component="form" action={formAction} sx={FORM_SX}>
      <input type="hidden" name="next" value={next ?? ""} />

      <FormError error={state.formError} />

      {/* These submit this same form to signInWithProviderAction — see SocialButtons.
          Inside a disabled fieldset because they are submit buttons on a form that may
          already be submitting: left live, a click during sign-up starts a second,
          concurrent submission of the same form. `contents` keeps the flex gap. */}
      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
        <SocialButtons
          googleEnabled={googleEnabled}
          appleEnabled={appleEnabled}
          googleLabel="Continue with Google"
          appleLabel="Continue with Apple"
          disabledTitle={socialTitle}
        />
      </Box>

      <DividerWithLabel label="OR" />

      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
        <Field
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />

        <Field
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password?.[0]}
          labelAction={
            <MuiLink
              component={NextLink}
              href="/forgot-password"
              variant="caption"
              sx={{ lineHeight: 1.3 }}
            >
              Forgot?
            </MuiLink>
          }
        />
      </Box>

      <SubmitButton label="Continue to my trips" pendingLabel="Signing you in…" />
    </Box>
  );
}
