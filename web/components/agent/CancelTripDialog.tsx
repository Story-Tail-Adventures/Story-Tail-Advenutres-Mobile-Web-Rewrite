"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { cancelTripAction } from "@/app/(agent)/agent/trips/[tripId]/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { AGENT_COPY } from "@/lib/agent/content";
import { cancelImpact, REFUND_STATUS_OPTIONS } from "@/lib/agent/cancelTrip";
import type { TripDetailOverview } from "@/lib/agent/tripDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.4.16 — Cancel / Archive Trip.
 *
 * §4.4 Pattern J on MUI's Dialog (MUI everywhere, 2026-10-01), where it was the native
 * `<dialog>` with `showModal()`. The Modal brings what the native element did — focus
 * trapping, Escape-to-dismiss, an inert background — plus focus returned to the button that
 * opened it on any close, including the programmatic one after a successful write. It
 * renders in a portal on document.body, so tests query it with `screen`, not `container`.
 * What it gives up is opening with JavaScript off, accepted in that ruling.
 *
 * IT IS ALSO THE EDIT DIALOG. A refund that is `pending` on the day a trip is cancelled
 * becomes `full` or `partial` weeks later, so a write-once cancellation would rot in
 * exactly the way `trip.refund_status` already had. `agent_set_trip_status` answers
 * `reason_changed` for a same-stage edit and writes no history row, so re-opening this on
 * a trip that is already cancelled is a correction rather than a second cancellation.
 *
 * The confirm is `variant="danger"` (contained error), where `ClientArchiveDialog`
 * deliberately is not. Its rule — "red is for things that do not come back" — is about the
 * ROW, and by that test cancelling is reversible: the stage can be moved back and this
 * migration keeps the refund history when it is. But the act the button stands for is a
 * phone call to a client and a supplier, and that does not come back. The copy carries the
 * same split: this marks the trip cancelled, and does not contact anybody.
 */

/** The legacy `w-[min(560px,calc(100vw-2rem))]` paper, 16px off the viewport edge. */
const PAPER_SX = { m: 2, width: "min(560px, calc(100vw - 2rem))", maxWidth: "100%" } as const;

export function CancelTripDialog({ overview }: { overview: TripDetailOverview }) {
  const [open, setOpen] = useState(false);
  const alreadyCancelled = overview.status === "cancelled";

  const [reason, setReason] = useState(overview.cancellationReason ?? "");
  const [refundStatus, setRefundStatus] = useState(overview.refundStatus ?? "");
  const [refundDetail, setRefundDetail] = useState(overview.refundDetail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const impact = cancelImpact(overview);
  const canSubmit = reason.trim() !== "" && !pending;
  const dialogLabel = alreadyCancelled ? AGENT_COPY.cancelSaveDetails : AGENT_COPY.cancelTripOpen;

  function openDialog() {
    setError(null);
    setReason(overview.cancellationReason ?? "");
    setRefundStatus(overview.refundStatus ?? "");
    setRefundDetail(overview.refundDetail ?? "");
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTripAction({
        tripId: overview.tripId,
        expectedVersion: overview.version,
        reason: reason.trim(),
        refundStatus: refundStatus || undefined,
        refundDetail: refundDetail.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      // `revalidatePath` refreshes the server data; this repaints the page already on
      // screen so the header's own chip follows the write without a reload.
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" size="sm" onClick={openDialog}>
        {dialogLabel}
        <Box component="span" sx={VISUALLY_HIDDEN}> — {overview.title}</Box>
      </Button>

      <Dialog
        open={open}
        // Like the native <dialog> this replaced: Escape closes, a stray backdrop click does
        // not (it would throw away what was typed).
        onClose={(_event, reason) => {
          if (reason !== "backdropClick") close();
        }}
        maxWidth={false}
        slotProps={{ paper: { "aria-label": dialogLabel, sx: PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Avatar
              sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: "error.container", color: "error.onContainer" }}
            >
              <Icon name="warning" size={18} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ display: "block", color: "error.main", lineHeight: 1.3 }}>
                {alreadyCancelled ? AGENT_COPY.cancelTripEditEyebrow : AGENT_COPY.cancelTripEyebrow}
              </Typography>
              <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "anywhere" }}>
                {overview.title}
              </Typography>
            </Box>
          </Stack>

          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {alreadyCancelled ? AGENT_COPY.cancelTripEditBody : AGENT_COPY.cancelTripBody}
          </Typography>

          {/* Derived from this trip, never hardcoded — see `cancelImpact`. Suppressed once the
              trip is already cancelled, where every line is in the past tense and misleading. */}
          {!alreadyCancelled && (
            <Card variant="outlined" sx={{ mt: 1.5, bgcolor: "surface.2" }}>
              <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}>
                  {AGENT_COPY.cancelImpactTitle}
                </Typography>
                {impact.length === 0 ? (
                  <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
                    {AGENT_COPY.cancelImpactNone}
                  </Typography>
                ) : (
                  <Box
                    component="ul"
                    sx={{ m: 0, p: 0, mt: 0.5, pl: 2.5, listStyle: "disc", display: "flex", flexDirection: "column", gap: 0.5 }}
                  >
                    {impact.map((line) => (
                      <Typography
                        component="li"
                        key={line.text}
                        variant="body2"
                        sx={{ color: line.tone === "warn" ? "text.primary" : "text.secondary" }}
                      >
                        {line.text}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          <Box sx={{ mt: 1.5 }}>
            <TextareaField
              id="cancel-reason"
              label={AGENT_COPY.cancelReasonLabel}
              rows={2}
              placeholder={AGENT_COPY.cancelReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              required
            />
          </Box>

          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            {/* "" is NOT a fifth status. The column is nullable and null means "not stated",
                which is a different fact from `none_expected` — one is an advisor who has not
                checked, the other is one who has. SelectField's `placeholder` is that empty
                option. */}
            <SelectField
              id="cancel-refund"
              label={AGENT_COPY.cancelRefundLabel}
              value={refundStatus}
              onChange={(e) => setRefundStatus(e.target.value)}
              disabled={pending}
              placeholder={AGENT_COPY.cancelRefundUnset}
              options={REFUND_STATUS_OPTIONS}
            />
            <Field
              id="cancel-refund-detail"
              label={AGENT_COPY.cancelRefundDetailLabel}
              placeholder={AGENT_COPY.cancelRefundDetailPlaceholder}
              value={refundDetail}
              onChange={(e) => setRefundDetail(e.target.value)}
              disabled={pending}
            />
          </Box>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {AGENT_COPY.cancelRefundDetailHelp}
          </Typography>

          {/* A courtesy, not the enforcement: the Edge Function refuses a reasonless
              cancellation regardless, and one rule in two places is one rule that drifts. */}
          {reason.trim() === "" && (
            <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
              {AGENT_COPY.cancelReasonRequired}
            </Typography>
          )}

          {error && (
            <Typography component="p" variant="body2" role="alert" sx={{ mt: 1, color: "error.main" }}>
              {error}
            </Typography>
          )}

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1 }}>
            <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={close}>
              {AGENT_COPY.cancelKeep}
            </Button>
            <Box sx={{ ml: "auto" }}>
              <Button type="button" variant="danger" size="sm" disabled={!canSubmit} onClick={submit}>
                {pending
                  ? AGENT_COPY.cancelSaving
                  : alreadyCancelled
                    ? AGENT_COPY.cancelSaveDetails
                    : AGENT_COPY.cancelConfirm}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
