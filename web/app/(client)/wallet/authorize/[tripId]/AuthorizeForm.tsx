"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";

import { BODY, BODY_S, BTN_44, LABEL, TITLE_S } from "@/components/client/client-sx";
import { Alert } from "@/components/ui/Alert";
import { fieldInputSx, fieldLabelSx } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { TAP_TARGET } from "@/lib/mui/sx";
import { formatMoney } from "@/lib/public/money";
import type { AuthorizeState } from "@/lib/wallet/actions";
import { WALLET } from "@/lib/wallet/content";
import { cardExpiry, cardLabel } from "@/lib/wallet/format";
import type { WalletCard } from "@/lib/wallet/queries";

const IDLE: AuthorizeState = { status: "idle" };

/** A selectable tile, as the artboard's `selSx` draws it: primary container when chosen. */
function tileSx(selected: boolean) {
  return {
    borderColor: selected ? "primary.main" : "divider",
    bgcolor: selected ? "primary.container" : "background.paper",
    color: selected ? "primary.onContainer" : "text.primary",
  } as const;
}

/**
 * Screen 2.4.3's form.
 *
 * THE LIMIT IS HELD IN CENTS AND SHOWN IN DOLLARS, and the conversion happens here rather
 * than in the action, because this is the only place the traveler can see the number it
 * produced. A dollars-to-cents conversion buried server-side is how a limit ends up a
 * hundredfold out with nobody able to point at where — and the Edge Function's $250,000
 * ceiling exists precisely because that mistake is easy to make.
 *
 * THE CONSENT BOX GATES THE SUBMIT BUTTON *AND* IS RE-CHECKED SERVER-SIDE. Disabling the
 * button is a courtesy; the server check is what makes `card_authorization.consent_payload`
 * mean anything, because a mandate recorded for somebody who never ticked the box is worse
 * than no record at all.
 *
 * The action is bound to its trip by the server component — the same action-as-prop shape
 * §2.5's ProfileForm and §2.6's Composer use. A server action is serialisable; a plain
 * function passed the same way typechecks, passes unit tests, and throws in a browser.
 *
 * ON MUI (step 2 of the migration): the card choice is a RadioGroup of outlined Paper tiles,
 * the presets are Paper tiles that are real buttons, the custom limit is an OutlinedInput
 * with a `$` adornment, and the consent is MUI's Checkbox — all of which wrap the same native
 * inputs, so the FormData the action receives (cardId, spendingLimitCents, expiresAt,
 * consent) is unchanged. Only brand + last 4 + expiry are ever shown for a card.
 */
export function AuthorizeForm({
  action,
  cards,
  presets,
  defaultExpiryIso,
  defaultExpiryLabel,
}: {
  action: (previous: AuthorizeState, formData: FormData) => Promise<AuthorizeState>;
  cards: WalletCard[];
  presets: { label: string; cents: number }[];
  defaultExpiryIso: string;
  defaultExpiryLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, IDLE);
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [cents, setCents] = useState(presets[1]?.cents ?? presets[0]?.cents ?? 0);
  const [consented, setConsented] = useState(false);

  const custom = !presets.some((preset) => preset.cents === cents);

  return (
    <Box component="form" action={submit} sx={{ mt: 2 }}>
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="spendingLimitCents" value={cents} />
      <input type="hidden" name="expiresAt" value={defaultExpiryIso} />

      <Typography id="authorize-card-heading" component="h2" variant="subtitle1" sx={TITLE_S}>
        {WALLET.authorizeCardHeading}
      </Typography>
      {/* The action reads the hidden `cardId` above. The radios post `cardChoice` too (MUI's
          RadioGroup always names its radios, inventing a name if given none), so it gets an
          honest one: the same payment_card uuid, never a Stripe id. */}
      <RadioGroup
        name="cardChoice"
        aria-labelledby="authorize-card-heading"
        value={cardId}
        onChange={(event) => setCardId(event.target.value)}
        sx={{ mt: 1, gap: 1 }}
      >
        {cards.map((card) => {
          const selected = card.id === cardId;
          return (
            <Paper key={card.id} variant="outlined" sx={tileSx(selected)}>
              {/* TAP_TARGET on the label, not the Paper: the enlarged hit area has to belong to
                  the element that toggles, or on a touch screen it swallows the tap. */}
              <FormControlLabel
                value={card.id}
                control={<Radio size="small" />}
                sx={{ m: 0, px: 1, py: 0.75, width: "100%", gap: 0.5, ...TAP_TARGET }}
                label={
                  <Box component="span" sx={{ display: "block", minWidth: 0 }}>
                    <Typography
                      component="span"
                      variant="subtitle1"
                      sx={{ ...TITLE_S, display: "block", fontFamily: "mono" }}
                    >
                      {cardLabel(card)}
                    </Typography>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ ...BODY_S, display: "block", opacity: 0.8 }}
                    >
                      {card.nickname ? `${card.nickname} · ` : ""}exp {cardExpiry(card)}
                    </Typography>
                  </Box>
                }
              />
            </Paper>
          );
        })}
      </RadioGroup>
      {/* 2.4.2 is deferred, so there is no "Add new card" branch — it would dead-end. */}
      <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 1, color: "text.secondary" }}>
        {WALLET.authorizeNoNewCard}
      </Typography>

      <Typography component="h2" variant="subtitle1" sx={{ ...TITLE_S, mt: 2.5 }}>
        {WALLET.limitHeading}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
        {WALLET.limitBody}
      </Typography>
      <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {presets.map((preset) => {
          const selected = !custom && preset.cents === cents;
          return (
            <Paper
              key={preset.label}
              component="button"
              type="button"
              variant="outlined"
              // The tile's look is the only other sign of which limit is picked.
              aria-pressed={selected}
              onClick={() => setCents(preset.cents)}
              sx={{
                ...tileSx(selected),
                ...TAP_TARGET,
                display: "block",
                width: "100%",
                p: 1.5,
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <Typography component="span" variant="caption" sx={LABEL}>
                {preset.label}
              </Typography>
              <Typography component="span" variant="subtitle1" sx={{ ...TITLE_S, display: "block", mt: 0.5 }}>
                {formatMoney({ amountCents: preset.cents, currency: "USD" })}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      <FormLabel htmlFor="custom-limit" sx={{ ...fieldLabelSx, mt: 1.5 }}>
        {WALLET.limitCustom}
      </FormLabel>
      <OutlinedInput
        id="custom-limit"
        type="number"
        size="small"
        value={(cents / 100).toFixed(2)}
        onChange={(event) => {
          // Round at the boundary, not in the action: `Math.round` here means the value in
          // the box and the value posted are the same number, and the server's
          // safe-integer check can never be the first place a traveler hears about it.
          const dollars = Number(event.target.value);
          setCents(Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0);
        }}
        startAdornment={<InputAdornment position="start">$</InputAdornment>}
        inputProps={{ min: 1, step: "0.01" }}
        sx={{ ...fieldInputSx, width: 160 }}
      />

      <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 1.5, color: "text.secondary" }}>
        {WALLET.expiresLabel}: {defaultExpiryLabel}. {WALLET.expiresHint}
      </Typography>

      <Paper elevation={0} sx={{ mt: 2, p: 1.5, bgcolor: "surface.2" }}>
        <FormControlLabel
          sx={{ alignItems: "flex-start", mx: 0, ...TAP_TARGET }}
          control={
            <Checkbox
              name="consent"
              size="small"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              sx={{ py: 0.25 }}
            />
          }
          label={
            <Typography component="span" variant="body2" sx={BODY}>
              {WALLET.consentMandate}
            </Typography>
          }
        />
      </Paper>

      {state.status === "error" && (
        <Box sx={{ mt: 1 }}>
          <Alert tone="error">{state.message}</Alert>
        </Box>
      )}

      <MuiButton
        type="submit"
        variant="contained"
        fullWidth
        disabled={pending || !consented || cents <= 0 || !cardId}
        startIcon={pending ? <Spinner /> : <Icon name="check" size={14} />}
        sx={{ ...BTN_44, ...TAP_TARGET, mt: 2 }}
      >
        {WALLET.authorizeCta} {formatMoney({ amountCents: cents, currency: "USD" })}
      </MuiButton>
    </Box>
  );
}
