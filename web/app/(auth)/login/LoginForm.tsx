"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { MappedAuthError } from "@/lib/auth-errors";
import { FormError } from "@/components/auth/FormError";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Field } from "@/components/ui/Field";
import { DividerWithLabel } from "@/components/ui/Divider";
import { signInAction } from "./actions";
import { initialLoginState } from "./state";

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
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="next" value={next ?? ""} />

      <FormError error={state.formError} />

      {/* These submit this same form to signInWithProviderAction — see SocialButtons.
          Inside a disabled fieldset because they are submit buttons on a form that may
          already be submitting: left live, a click during sign-up starts a second,
          concurrent submission of the same form. `contents` keeps the flex gap. */}
      <fieldset disabled={isPending} className="contents">
        <SocialButtons
          googleEnabled={googleEnabled}
          appleEnabled={appleEnabled}
          googleLabel="Continue with Google"
          appleLabel="Continue with Apple"
          disabledTitle={socialTitle}
        />
      </fieldset>

      <DividerWithLabel label="OR" />

      <fieldset disabled={isPending} className="contents">
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
            <Link href="/forgot-password" className="field-label text-primary">
              Forgot?
            </Link>
          }
        />
      </fieldset>

      <SubmitButton label="Continue to my trips" pendingLabel="Signing you in…" />
    </form>
  );
}
