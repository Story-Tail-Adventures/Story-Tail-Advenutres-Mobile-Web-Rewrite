"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import NextLink from "@/components/mui/NextLink";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import { MFA_CODE_LENGTH } from "@/lib/validation/mfa";
import { beginMfaEnrollmentAction, verifyMfaEnrollmentAction } from "./actions";
import {
  MFA_SETUP_TEXT,
  initialMfaEnrollState,
  initialMfaVerifyState,
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
 * The code input's type: mono, centred, wide tracking — what C216 puts on its own code
 * field through `slotProps.input.sx`. Field owns its OutlinedInput, so this reaches the
 * <input> from a wrapper instead.
 */
const CODE_INPUT_SX = {
  "& input": { textAlign: "center", fontFamily: "mono", letterSpacing: "0.5em" },
} as const;

/** The method tiles from C216. Only one of them is a choice today — see actions.ts. */
function MethodTiles() {
  const methods = [
    {
      icon: "sparkle" as const,
      title: MFA_SETUP_TEXT.methodAppTitle,
      sub: MFA_SETUP_TEXT.methodAppSub,
      on: true,
    },
    {
      icon: "phone" as const,
      title: MFA_SETUP_TEXT.methodSmsTitle,
      sub: MFA_SETUP_TEXT.methodSmsSub,
      on: false,
    },
  ];

  return (
    <Box
      component="ul"
      sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1, m: 0, p: 0, listStyle: "none" }}
    >
      {methods.map((method) => (
        // Outlined Paper per tile, as the artboard draws them: the live one on the primary
        // container with a primary border, the other on the paper surface and dimmed,
        // because it is not a choice yet.
        <Paper
          key={method.title}
          component="li"
          variant="outlined"
          sx={{
            p: 1.5,
            height: "100%",
            bgcolor: method.on ? "primary.container" : "background.paper",
            color: method.on ? "primary.onContainer" : "text.primary",
            borderColor: method.on ? "primary.main" : "divider",
            opacity: method.on ? 1 : 0.6,
          }}
        >
          <Icon name={method.icon} size={18} />
          <Typography component="p" variant="subtitle1" sx={{ mt: 0.75, color: "inherit" }}>
            {method.title}
          </Typography>
          <Typography component="p" variant="caption" sx={{ color: "inherit", opacity: 0.8 }}>
            {method.sub}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

/**
 * Screen 2.1.6 MFA Setup — the interactive half (design: C216 / M216).
 *
 * Two forms, one per action. `useFormStatus` only reports on its nearest ancestor form, and
 * the two beats have genuinely different pending states — "getting your code" and "checking
 * that code" are not the same wait.
 */
export function MfaSetupForm({ next }: { next: string }) {
  const [enrollState, enrollAction] = useActionState(
    beginMfaEnrollmentAction,
    initialMfaEnrollState,
  );
  const [verifyState, verifyAction, isVerifying] = useActionState(
    verifyMfaEnrollmentAction,
    initialMfaVerifyState,
  );

  const { enrollment } = enrollState;

  return (
    <Box sx={COLUMN_SX}>
      <MethodTiles />

      {enrollment ? (
        <>
          <Card variant="flat">
            <CardContent
              sx={{
                ...NOTE_SX,
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { sm: "center" },
                gap: 1.5,
              }}
            >
              {/* A plain <img>, not next/image, and deliberately.
                  `next/image` refuses SVG data URIs outright — SVG is only allowed behind
                  `dangerouslyAllowSVG`, a global relaxation whose name is the argument
                  against turning it on for one QR code. There is also nothing here for it to
                  do: the bytes are already in the response, so there is no fetch to optimise,
                  no remote host to whitelist, and no layout shift to prevent at a fixed 112px.
                  An SVG loaded through <img> cannot run script or fetch anything, which is
                  the property that makes this safe. The white frame is the image's own
                  padding: a QR code needs a light quiet zone in both schemes. */}
              <Box
                component="img"
                src={enrollment.qrCode}
                alt={MFA_SETUP_TEXT.scanTitle}
                width={112}
                height={112}
                sx={{
                  display: "block",
                  boxSizing: "border-box",
                  width: 112,
                  height: 112,
                  flexShrink: 0,
                  alignSelf: "center",
                  borderRadius: 1,
                  bgcolor: "common.white",
                  p: 0.75,
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="p" variant="subtitle1">
                  {MFA_SETUP_TEXT.scanTitle}
                </Typography>
                <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  {MFA_SETUP_TEXT.scanBody}
                </Typography>
                <Typography
                  component="p"
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, fontWeight: 500 }}
                >
                  {MFA_SETUP_TEXT.secretLabel}
                </Typography>
                {/* Selectable and wrapping: "can't scan" is exactly when someone needs to
                    copy this by hand. */}
                <Typography
                  component="code"
                  variant="caption"
                  sx={{ display: "block", fontFamily: "mono", color: "text.primary", wordBreak: "break-all" }}
                >
                  {enrollment.secret}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Box component="form" action={verifyAction} sx={COLUMN_SX}>
            <input type="hidden" name="factorId" value={enrollment.factorId} />
            <input type="hidden" name="next" value={next} />

            <FormError error={verifyState.formError} />

            <Box component="fieldset" disabled={isVerifying} sx={FIELDSET_SX}>
              <Box sx={CODE_INPUT_SX}>
                <Field
                  id="code"
                  name="code"
                  label={MFA_SETUP_TEXT.codeLabel}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={MFA_CODE_LENGTH + 2}
                  hint={MFA_SETUP_TEXT.codeHint}
                  error={verifyState.fieldErrors?.code?.[0]}
                />
              </Box>
            </Box>

            <SubmitButton
              label={MFA_SETUP_TEXT.verify}
              pendingLabel={MFA_SETUP_TEXT.verifyPending}
            />
          </Box>
        </>
      ) : (
        <Box component="form" action={enrollAction} sx={COLUMN_SX}>
          <FormError error={enrollState.formError} />
          <SubmitButton
            label={MFA_SETUP_TEXT.begin}
            pendingLabel={MFA_SETUP_TEXT.beginPending}
          />
        </Box>
      )}

      <Card variant="flat">
        <CardContent sx={NOTE_SX}>
          <Typography component="p" variant="subtitle1">
            {MFA_SETUP_TEXT.recoveryTitle}
          </Typography>
          <Typography component="p" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {MFA_SETUP_TEXT.recoveryBody}
          </Typography>
        </CardContent>
      </Card>

      <MuiLink
        component={NextLink}
        href={next}
        variant="subtitle2"
        color="text.secondary"
        sx={{ ...TAP_LINK, alignSelf: "center" }}
      >
        {MFA_SETUP_TEXT.skip}
      </MuiLink>
    </Box>
  );
}
