"use client";

import { useActionState, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import { signOutAction } from "@/lib/auth/actions";
import { changeEmailAction, resendVerificationAction } from "./actions";
import {
  VERIFY_TEXT,
  initialChangeEmailState,
  initialResendState,
} from "./state";

/** The screen column and the form columns: the legacy 14px gap between rows. */
const COLUMN_SX = { display: "flex", flexDirection: "column", gap: 1.75 } as const;

/** A fieldset that disables its controls while the form is pending but adds no box of its own. */
const FIELDSET_SX = { display: "contents", m: 0, p: 0, border: 0, minWidth: 0 } as const;

/** The note card's inside: the legacy 14px padding on MUI's CardContent. */
const NOTE_SX = { p: 1.75, "&:last-child": { pb: 1.75 } } as const;

/** A text link with a 44px hit area on touch screens, its box unchanged (the legacy `.tap-44`). */
const TAP_LINK = { display: "inline-flex", alignItems: "center", ...TAP_TARGET } as const;

/**
 * Screen 2.1.3 Email Verification — the interactive half (design: C213 / M213).
 *
 * `sessionEmail` is non-null only when someone reaches this screen with a live session.
 * When it is null the resend form has to ask for the address, because straight after
 * sign-up GoTrue has not issued a session and there is nothing to read it from.
 */
export function VerifyEmailPanel({ sessionEmail }: { sessionEmail: string | null }) {
  const [resend, resendAction, resendPending] = useActionState(
    resendVerificationAction,
    initialResendState,
  );
  const [changed, changeAction, changePending] = useActionState(
    changeEmailAction,
    initialChangeEmailState,
  );
  const [changing, setChanging] = useState(false);

  return (
    <Box sx={COLUMN_SX}>
      <Box sx={{ display: "flex", justifyContent: "center", py: 1.75 }}>
        {/* The mail glyph on MUI's Avatar, as C213 draws it: 84px on the secondary container. */}
        <Avatar
          sx={{ width: 84, height: 84, bgcolor: "secondary.container", color: "secondary.onContainer" }}
        >
          <Icon name="mail" size={36} />
        </Avatar>
      </Box>

      <Card variant="flat">
        <CardContent sx={NOTE_SX}>
          <Typography component="p" variant="subtitle1">
            {VERIFY_TEXT.whyTitle}
          </Typography>
          <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {VERIFY_TEXT.whyBody}
          </Typography>
        </CardContent>
      </Card>

      {changed.outcome === "sent" ? (
        <Alert tone="success">{VERIFY_TEXT.changeEmailSent}</Alert>
      ) : (
        <Box component="form" action={resendAction} sx={COLUMN_SX}>
          <FormError error={resend.formError} />

          {resend.outcome === "sent" && <Alert tone="success">{VERIFY_TEXT.resendSent}</Alert>}

          {!sessionEmail && (
            <Box component="fieldset" disabled={resendPending} sx={FIELDSET_SX}>
              <Field
                id="email"
                name="email"
                label={VERIFY_TEXT.email}
                type="email"
                autoComplete="email"
                required
                defaultValue={resend.email}
                error={resend.fieldErrors?.email?.[0]}
              />
            </Box>
          )}

          <SubmitButton
            label={VERIFY_TEXT.resend}
            pendingLabel={VERIFY_TEXT.resendPending}
          />
        </Box>
      )}

      {sessionEmail ? (
        <>
          {changed.outcome !== "sent" && (
            <Box>
              {changing ? (
                <Box
                  component="form"
                  action={changeAction}
                  sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
                >
                  <FormError error={changed.formError} />
                  <Box component="fieldset" disabled={changePending} sx={FIELDSET_SX}>
                    <Field
                      id="newEmail"
                      name="email"
                      label={VERIFY_TEXT.changeEmailLabel}
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                      defaultValue={changed.email}
                      error={changed.fieldErrors?.email?.[0]}
                    />
                  </Box>
                  <SubmitButton
                    label={VERIFY_TEXT.changeEmailSubmit}
                    pendingLabel={VERIFY_TEXT.changeEmailPending}
                  />
                </Box>
              ) : (
                <Button variant="text" onClick={() => setChanging(true)}>
                  {VERIFY_TEXT.changeEmailToggle}
                </Button>
              )}
            </Box>
          )}

          {/* Its own form: a nested <form> is invalid HTML, and sign-out must not ride
              along on whatever the resend form happens to contain. */}
          <form action={signOutAction}>
            <Button type="submit" variant="text" size="sm">
              {VERIFY_TEXT.signOut}
            </Button>
          </form>
        </>
      ) : (
        <MuiLink
          component={NextLink}
          href="/register"
          variant="subtitle2"
          sx={{ ...TAP_LINK, alignSelf: "flex-start" }}
        >
          {VERIFY_TEXT.useDifferent}
        </MuiLink>
      )}
    </Box>
  );
}
