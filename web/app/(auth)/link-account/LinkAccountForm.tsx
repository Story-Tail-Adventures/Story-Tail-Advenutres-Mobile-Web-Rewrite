"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Field } from "@/components/ui/Field";
import type { OAuthProvider } from "@/lib/auth/providers";
import { linkAccountAction } from "./actions";
import { LINK_TEXT, initialLinkAccountState, linkSubmitLabel } from "./state";

/**
 * Screen 2.1.8 Social Login / Account Linking — the interactive half (design: C218).
 *
 * The prototype shows an identity card with the person's avatar, name and "created Mar
 * 2024". None of that is rendered here: the only thing this page actually knows is an
 * address the OAuth provider asserted, and reading a name or a join date out of the
 * account before anyone has proved they own it would answer "does this account exist, and
 * whose is it?" to an unauthenticated visitor. The address they just authenticated with at
 * the provider is shown back to them instead.
 */
export function LinkAccountForm({ provider }: { provider: OAuthProvider }) {
  const [state, formAction, isPending] = useActionState(
    linkAccountAction,
    initialLinkAccountState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="provider" value={provider} />

      <FormError error={state.formError} />

      <fieldset disabled={isPending} className="contents">
        <Field
          id="email"
          name="email"
          label={LINK_TEXT.email}
          type="email"
          autoComplete="email"
          required
          autoFocus
          defaultValue={state.email}
          error={state.fieldErrors?.email?.[0]}
        />
        <Field
          id="password"
          name="password"
          label={LINK_TEXT.password}
          type="password"
          autoComplete="current-password"
          required
          error={state.fieldErrors?.password?.[0]}
          labelAction={
            <Link href="/forgot-password" className="field-label text-primary">
              {LINK_TEXT.forgot}
            </Link>
          }
        />
      </fieldset>

      <SubmitButton label={linkSubmitLabel(provider)} pendingLabel={LINK_TEXT.pending} />

      <Link href="/login" className="t-label-l tap-44 self-center text-primary">
        {LINK_TEXT.useDifferent}
      </Link>
    </form>
  );
}
