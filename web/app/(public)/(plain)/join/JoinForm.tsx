"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DividerWithLabel } from "@/components/ui/Divider";
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

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="filled" size="lg" fullWidth disabled={pending}>
      {pending ? (
        <>
          <Spinner className="size-5" />
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
    <div role="status" className="flex flex-col">
      <h2 className="t-title-l text-on-surface">{JOIN_TEXT.confirmTitle}</h2>
      <p className="t-body mt-1.5 text-on-surface-variant">
        {JOIN_TEXT.confirmBefore}
        <b className="font-semibold text-on-surface">{email}</b>
        {JOIN_TEXT.confirmAfter}
      </p>
      <Link href={signInHref} className="t-label-l tap-44 mt-3.5 self-start text-primary">
        {JOIN_TEXT.signIn}
      </Link>
    </div>
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
    <form action={formAction} className="flex flex-col">
      <input type="hidden" name="intent" value={intent ?? ""} />
      <input type="hidden" name="trip" value={trip ?? ""} />
      <input type="hidden" name="next" value={next} />

      {state.formError && (
        <Alert tone="error" className="mb-3">
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
        className="mb-2"
        disabled={!googleEnabled}
        title={googleEnabled ? undefined : JOIN_TEXT.socialDisabledTitle}
      >
        {JOIN_TEXT.google}
      </Button>
      <Button
        variant="outlined"
        size="lg"
        fullWidth
        className="mb-3.5"
        disabled={!appleEnabled}
        title={appleEnabled ? undefined : JOIN_TEXT.socialDisabledTitle}
      >
        {JOIN_TEXT.apple}
      </Button>

      <div className="my-1 mb-3">
        <DividerWithLabel label={JOIN_TEXT.divider} />
      </div>

      <fieldset disabled={isPending} className="contents">
        <div className="grid grid-cols-2 gap-2.5">
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
        </div>

        <div className="mt-2">
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
        </div>

        <div className="mt-2">
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
        </div>

        <div className="mt-3">
          <label className="t-body-s flex items-start gap-2.5 text-on-surface-variant">
            <input
              id="terms"
              type="checkbox"
              name="terms"
              className="filter-box mt-0.5"
              required
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? "terms-error" : undefined}
            />
            <span>
              {JOIN_TEXT.termsBefore}
              <Link href="/legal/terms" className="text-primary underline underline-offset-2">
                {JOIN_TEXT.termsLink}
              </Link>
              {JOIN_TEXT.termsAnd}
              <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
                {JOIN_TEXT.privacyLink}
              </Link>
            </span>
          </label>
          {termsError && (
            <p id="terms-error" className="t-body-s mt-1.5 text-error">
              {termsError}
            </p>
          )}
        </div>
      </fieldset>

      <div className="mt-3.5">
        <SubmitButton label={submitLabel(intent)} />
      </div>

      <div className="t-label-l mt-3 flex items-center justify-between gap-3">
        <Link href={signInHref} className="tap-44 text-primary">
          {JOIN_TEXT.signIn}
        </Link>
        <a href={emailHref} className="tap-44 text-right text-on-surface-variant">
          {JOIN_TEXT.emailInstead}
        </a>
      </div>
    </form>
  );
}
