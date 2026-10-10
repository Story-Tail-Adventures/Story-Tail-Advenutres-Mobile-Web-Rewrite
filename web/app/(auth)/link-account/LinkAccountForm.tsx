"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Field } from "@/components/ui/Field";
import type { OAuthProvider } from "@/lib/auth/providers";
import { TAP_TARGET } from "@/lib/mui/sx";
import { linkAccountAction } from "./actions";
import { LINK_TEXT, initialLinkAccountState, linkSubmitLabel } from "./state";

/** The form column: the legacy 14px gap between rows. */
const FORM_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

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
    <Box component="form" action={formAction} sx={FORM_SX}>
      <input type="hidden" name="provider" value={provider} />

      <FormError error={state.formError} />

      <Box component="fieldset" disabled={isPending} sx={FIELDSET_SX}>
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
            <MuiLink
              component={NextLink}
              href="/forgot-password"
              variant="caption"
              sx={{ lineHeight: 1.3 }}
            >
              {LINK_TEXT.forgot}
            </MuiLink>
          }
        />
      </Box>

      <SubmitButton label={linkSubmitLabel(provider)} pendingLabel={LINK_TEXT.pending} />

      <MuiLink
        component={NextLink}
        href="/login"
        variant="subtitle2"
        sx={{ ...TAP_LINK, alignSelf: "center" }}
      >
        {LINK_TEXT.useDifferent}
      </MuiLink>
    </Box>
  );
}
