"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";

import { BTN_44 } from "@/components/client/client-sx";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { TAP_TARGET } from "@/lib/mui/sx";
import type { AuthorizeState } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";

const IDLE: AuthorizeState = { status: "idle" };

/** The 44px button box with the legacy tap area. */
const CTA_SX = { ...BTN_44, ...TAP_TARGET } as const;

/**
 * Screen 2.4.7's confirmation.
 *
 * NO TYPE-TO-CONFIRM. §2.5.10's account closure asks the traveler to type their email,
 * because that is irreversible and takes everything with it. This is not that: removing an
 * authorization stops future charges on one card for one trip, and re-authorizing is two
 * taps. Matching the heavier ceremony would teach people to type past confirmations.
 *
 * The destructive button is the one on the right and is not the default focus; Cancel is a
 * plain link so a stray Enter cannot fire the revoke.
 */
export function RemoveForm({
  action,
}: {
  action: (previous: AuthorizeState, formData: FormData) => Promise<AuthorizeState>;
}) {
  const [state, submit, pending] = useActionState(action, IDLE);

  return (
    <Box component="form" action={submit} sx={{ mt: 2.5 }}>
      {state.status === "error" && (
        <Box sx={{ mb: 1 }}>
          <Alert tone="error">{state.message}</Alert>
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1 }}>
        <MuiButton component={NextLink} href="/wallet" variant="outlined" sx={CTA_SX}>
          {WALLET.removeCancel}
        </MuiButton>
        <MuiButton
          type="submit"
          variant="contained"
          color="error"
          disabled={pending}
          startIcon={pending ? <Spinner /> : <Icon name="warning" size={14} />}
          sx={{ ...CTA_SX, ml: "auto" }}
        >
          {WALLET.removeCta}
        </MuiButton>
      </Box>
    </Box>
  );
}
