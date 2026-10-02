import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MuiAlert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BACK_LINK_SX,
  BODY,
  BODY_S,
  BTN_SM,
  CARD_PAD,
  HEADLINE,
  MAX_W_2XL,
  pageSx,
} from "@/components/client/client-sx";
import { RetryState } from "@/components/client/RetryState";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { TAP_TARGET } from "@/lib/mui/sx";
import { currentPlatformUser } from "@/lib/trips/queries";
import { WALLET } from "@/lib/wallet/content";
import { cardLabel, formatAmount, formatDate } from "@/lib/wallet/format";
import { cardFor, eventFor, loadWallet } from "@/lib/wallet/queries";

export const metadata: Metadata = { title: WALLET.useDetailTitle };

/** The two full-width `.btn-sm.tap-44` actions. */
const ACTION_SX = { ...BTN_SM, ...TAP_TARGET } as const;

/**
 * Screen 2.4.6 Card Use Detail — docs/Screen-Inventory.md §2.4.6, §4.4 (Pattern **C**), and
 * design/source-prototype/screens/client-payment.jsx (C246_CardUseDetail) +
 * client-payment-mobile.jsx (M246_UseDetail). P1.
 *
 * THE SENTENCE THAT MATTERS ON THIS SCREEN is "the supplier charged your card directly.
 * Story-Tail never handled the money." Story-Tail is not the merchant of record — it is
 * contractually prohibited from being one for its own services (BRD §10.5) — and a detail
 * screen that reads like a receipt from Story-Tail describes a relationship the business
 * does not have. The success card says who took the money, not that a payment succeeded.
 *
 * **"FLAG AS UNFAMILIAR" IS DISABLED**, and the blocker is a contradiction in the Data Model
 * rather than missing code. §9.4 says `card_use_event` is "Append-only: no UPDATE, no
 * DELETE", and in the same table defines `client_flag_status` with three values —
 * `not_flagged`, `flagged`, `resolved` — that only a sequence of UPDATEs can produce. The
 * DDL comment and the `rls-policy` skill both repeat the append-only rule. Either a separate
 * append-only `card_use_flag` table or an explicit narrowing of the claim; that is a ruling,
 * not a screen decision, and it is recorded at Data-Model §9.4.
 *
 * **THE RECEIPT IS ABSENT BY AN EXISTING DECISION**, not an omission.
 * `card_use_event.receipt_document_id` FKs into `document`, but `document_self_select`'s kind
 * allowlist excludes `receipt` on purpose (20260907031255): a supplier receipt shows what the
 * agency actually paid, immediately after `cost_cents` and `total_commission_cents` were
 * withheld to prevent exactly that. Reversing it is a margin decision for the business.
 *
 * **THE AGENT'S NOTE IS ABSENT TOO.** The artboard shows "Note from Gyasi" — that is
 * `card_use_event.justification`, which Data-Model §9.4 classifies Internal and which the
 * wallet function therefore never selects. It is the reason the agent wrote for the audit
 * trail, not a line of prose composed for the traveler. "Ask Gyasi about this" goes to §2.6
 * instead, where a real answer can be given.
 */
export default async function CardUseDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [wallet, me] = await Promise.all([loadWallet(), currentPlatformUser()]);

  if (!wallet) return <RetryState />;

  const event = eventFor(wallet, eventId);
  // The wallet only ever contains this traveler's own rows, so "not in the wallet" already
  // means "not yours or not there" — one answer, the same convention every §2.x read uses.
  if (!event) notFound();

  const card = cardFor(wallet, event.cardId);
  const rows: { label: string; value: string; mono?: boolean }[] = [
    {
      label: WALLET.detailAmount,
      value: formatAmount(event.amountCents, event.currency),
      mono: true,
    },
    { label: WALLET.detailCard, value: card ? cardLabel(card) : "—" },
    { label: WALLET.detailSupplier, value: event.supplierName },
    { label: WALLET.detailTrip, value: event.tripTitle ?? "—" },
    { label: WALLET.detailWhen, value: formatDate(event.createdAt, me.timeZone) },
    ...(event.referenceNumber
      ? [{ label: WALLET.detailReference, value: event.referenceNumber, mono: true }]
      : []),
  ];

  return (
    <Box sx={pageSx(MAX_W_2XL)}>
      <MuiButton
        component={NextLink}
        href="/wallet/activity"
        variant="text"
        size="small"
        startIcon={<Icon name="arrow_left" size={14} />}
        sx={BACK_LINK_SX}
      >
        {WALLET.activityTitle}
      </MuiButton>

      <Typography component="h1" variant="h5" sx={{ ...HEADLINE, fontFamily: "mono" }}>
        {formatAmount(event.amountCents, event.currency)}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 0.5, color: "text.secondary" }}>
        {event.supplierName} · {formatDate(event.createdAt, me.timeZone)}
      </Typography>

      {/* MUI's success Alert, as the artboard draws it. `role="status"`: this is a standing
          statement about a past charge, not an interruption, so it gets the polite region. */}
      <MuiAlert
        severity="success"
        role="status"
        icon={<Icon name="check" size={16} strokeWidth={2.5} />}
        sx={{ mt: 2 }}
      >
        <AlertTitle>{WALLET.chargedBySupplier}</AlertTitle>
        {WALLET.chargedBySupplierBody}
      </MuiAlert>

      <Card sx={{ mt: 1.5 }}>
        <CardContent sx={CARD_PAD}>
          <Box component="dl" sx={{ m: 0 }}>
            {rows.map((row, index) => (
              <Box
                key={row.label}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 2,
                  py: 1,
                  ...(index > 0 ? { borderTop: 1, borderColor: "divider" } : undefined),
                }}
              >
                <Typography
                  component="dt"
                  variant="body2"
                  sx={{ ...BODY_S, flexShrink: 0, color: "text.secondary" }}
                >
                  {row.label}
                </Typography>
                <Typography
                  component="dd"
                  variant="body2"
                  sx={{ ...BODY_S, m: 0, textAlign: "right", fontFamily: row.mono ? "mono" : undefined }}
                >
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={1} sx={{ mt: 2 }}>
        <Box>
          <MuiButton
            variant="outlined"
            size="small"
            fullWidth
            disabled
            aria-disabled="true"
            startIcon={<Icon name="warning" size={13} />}
            sx={ACTION_SX}
          >
            {WALLET.flagUnfamiliar}
          </MuiButton>
          <Typography component="p" variant="body2" sx={{ ...BODY_S, mt: 0.5, color: "text.secondary" }}>
            {WALLET.flagDeferred}
          </Typography>
        </Box>

        {/* Goes to §2.6, which is built — the one action on this screen that is fully real. */}
        <MuiButton
          component={NextLink}
          href="/messages/new"
          variant="outlined"
          color="secondary"
          size="small"
          fullWidth
          startIcon={<Icon name="message" size={13} />}
          sx={ACTION_SX}
        >
          {WALLET.askGyasi}
        </MuiButton>
      </Stack>
    </Box>
  );
}
