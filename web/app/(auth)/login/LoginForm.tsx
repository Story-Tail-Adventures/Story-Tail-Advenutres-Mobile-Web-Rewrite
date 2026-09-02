"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { DividerWithLabel } from "@/components/ui/Divider";
import { signInAction } from "./actions";
import { initialLoginState } from "./state";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" fullWidth disabled={pending}>
      {pending ? (
        <>
          <Spinner className="size-5" />
          Signing you in…
        </>
      ) : (
        "Continue to my trips"
      )}
    </Button>
  );
}

export function LoginForm({
  next,
  googleEnabled,
  appleEnabled,
}: {
  next?: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialLoginState,
  );

  const socialTitle = "Social sign-in isn't switched on yet — use your email below.";

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="next" value={next ?? ""} />

      {state.formError && (
        <Alert tone="error">
          {state.formError.message}
          {state.formError.action && (
            <>
              {" "}
              <Link
                href={state.formError.action.href}
                className="font-semibold underline underline-offset-2"
              >
                {state.formError.action.label}
              </Link>
              .
            </>
          )}
        </Alert>
      )}

      <Button
        variant="outlined"
        size="lg"
        fullWidth
        disabled={!googleEnabled}
        title={googleEnabled ? undefined : socialTitle}
      >
        Continue with Google
      </Button>
      <Button
        variant="outlined"
        size="lg"
        fullWidth
        disabled={!appleEnabled}
        title={appleEnabled ? undefined : socialTitle}
      >
        Continue with Apple
      </Button>

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

      <SubmitButton />
    </form>
  );
}
