"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { cancelTripAction } from "@/app/(agent)/agent/trips/[tripId]/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { AGENT_COPY, cancelLinesCheckbox, cancelReceipt } from "@/lib/agent/content";
import { cancelImpact, REFUND_STATUS_OPTIONS } from "@/lib/agent/cancelTrip";
import type { TripDetailOverview, TripOpenCommissionLine } from "@/lib/agent/tripDetail";
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
 *
 * AND IT CLOSES THE TRIP'S OPEN COMMISSION, when asked (§3.7 Stage 5; Gyasi, 2026-10-12:
 * offered, on by default). The Expected and Invoiced ledger lines are listed under one
 * checkbox, checked; the save sends each at the version listed, and the Edge Function marks
 * Lost only those still as listed. A line that moved since is skipped, so the receipt stays on
 * screen to say so rather than the dialog closing over it.
 */

/** The legacy `w-[min(560px,calc(100vw-2rem))]` paper, 16px off the viewport edge. */
const PAPER_SX = { m: 2, width: "min(560px, calc(100vw - 2rem))", maxWidth: "100%" } as const;

export function CancelTripDialog({
  overview,
  openCommission,
}: {
  overview: TripDetailOverview;
  /** The trip's Expected and Invoiced ledger lines; null when that read failed. */
  openCommission: TripOpenCommissionLine[] | null;
}) {
  const [open, setOpen] = useState(false);
  const alreadyCancelled = overview.status === "cancelled";
  // Which dialog this is, fixed when it opens: the save's `router.refresh()` flips the trip to
  // cancelled while the receipt is still up, and the heading and the dialog's name must not
  // change under the advisor mid-read.
  const [openedCancelled, setOpenedCancelled] = useState(alreadyCancelled);
  const editing = open ? openedCancelled : alreadyCancelled;

  const [reason, setReason] = useState(overview.cancellationReason ?? "");
  const [refundStatus, setRefundStatus] = useState(overview.refundStatus ?? "");
  const [refundDetail, setRefundDetail] = useState(overview.refundDetail ?? "");
  const [error, setError] = useState<string | null>(null);
  // "Mark these as Lost", on by default when CANCELLING (Gyasi, 2026-10-12). Off on "Save
  // details": a line still open on a trip already cancelled was most often reopened on
  // purpose (the supplier is paying after all), and fixing a refund note must not re-lose it.
  // The lines are snapshotted when the dialog opens, so the versions sent are the ones the
  // advisor read, not whatever a refresh behind the open dialog brought in.
  const [closeLines, setCloseLines] = useState(!alreadyCancelled);
  const [shownLines, setShownLines] = useState<TripOpenCommissionLine[]>([]);
  // What happened to the lines, kept on screen after the save (SaveAsTemplateDialog's
  // receipt): a skipped line is something the advisor needs to go and look at.
  const [receipt, setReceipt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const impact = cancelImpact(overview);
  const canSubmit = reason.trim() !== "" && !pending;
  const dialogLabel = editing ? AGENT_COPY.cancelSaveDetails : AGENT_COPY.cancelTripOpen;

  function openDialog() {
    setError(null);
    setReason(overview.cancellationReason ?? "");
    setRefundStatus(overview.refundStatus ?? "");
    setRefundDetail(overview.refundDetail ?? "");
    setOpenedCancelled(alreadyCancelled);
    setCloseLines(!alreadyCancelled);
    setShownLines(openCommission ?? []);
    setReceipt(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function submit() {
    setError(null);
    const named = closeLines ? shownLines : [];
    startTransition(async () => {
      const result = await cancelTripAction({
        tripId: overview.tripId,
        expectedVersion: overview.version,
        reason: reason.trim(),
        refundStatus: refundStatus || undefined,
        refundDetail: refundDetail.trim() || undefined,
        closeCommission: named.map((l) => ({ id: l.commissionId, version: l.version })),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // From what was SENT, not only what came back: lines named but in neither count are
      // said as unconfirmed rather than letting the dialog close as if they were done.
      const said = cancelReceipt({
        cancelled: !openedCancelled,
        named: named.length,
        closed: result.linesClosed,
        skipped: result.linesSkipped,
      });
      if (said) setReceipt(said);
      else setOpen(false);
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
        // not (it would throw away what was typed). Not while saving either: the receipt is
        // the only place a skipped line is reported, and closing first would lose it.
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) close();
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
                {editing ? AGENT_COPY.cancelTripEditEyebrow : AGENT_COPY.cancelTripEyebrow}
              </Typography>
              <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "anywhere" }}>
                {overview.title}
              </Typography>
            </Box>
          </Stack>

          {receipt ? (
            <>
              <Typography id="cancel-receipt" component="p" variant="body2" role="status" sx={{ mt: 1.5 }}>
                {receipt}
              </Typography>
              <Box sx={{ mt: 1.75, display: "flex", justifyContent: "flex-end" }}>
                {/* Takes focus: the button that saved is gone, and focus must not fall to the
                    page. Described by the receipt, because a live region that arrives already
                    filled, as focus moves, is not reliably announced on its own. */}
                <Button
                  type="button"
                  variant="outlined"
                  size="sm"
                  onClick={close}
                  autoFocus
                  aria-describedby="cancel-receipt"
                >
                  {AGENT_COPY.cancelDone}
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                {editing ? AGENT_COPY.cancelTripEditBody : AGENT_COPY.cancelTripBody}
              </Typography>

              {/* Derived from this trip, never hardcoded — see `cancelImpact`. Suppressed once the
                  trip is already cancelled, where every line is in the past tense and misleading. */}
              {!editing && (
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

              {/* §3.7 Stage 5. Shown on "Save details" too: a trip cancelled before this shipped
                  is cleaned up from the same dialog. A failed read says so rather than offering
                  nothing, which would read as "nothing open". */}
              {openCommission === null ? (
                <Typography component="p" variant="body2" sx={{ mt: 1.5, color: "text.secondary" }}>
                  {AGENT_COPY.cancelLinesUnavailable}
                </Typography>
              ) : (
                shownLines.length > 0 && (
                  <Card variant="outlined" sx={{ mt: 1.5, bgcolor: "surface.2" }}>
                    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Typography
                        id="cancel-lines-title"
                        variant="caption"
                        sx={{ display: "block", fontWeight: 500, color: "text.secondary" }}
                      >
                        {AGENT_COPY.cancelLinesTitle}
                      </Typography>
                      <Box
                        component="ul"
                        aria-labelledby="cancel-lines-title"
                        sx={{ m: 0, p: 0, mt: 0.5, pl: 2.5, listStyle: "disc", display: "flex", flexDirection: "column", gap: 0.25 }}
                      >
                        {shownLines.map((line) => (
                          <Typography component="li" key={line.commissionId} variant="body2">
                            {line.supplierName} · {line.statusLabel} · {line.amountLabel}
                          </Typography>
                        ))}
                      </Box>
                      <FormControlLabel
                        sx={{ mt: 0.5 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={closeLines}
                            onChange={(e) => setCloseLines(e.target.checked)}
                            disabled={pending}
                            slotProps={{ input: { "aria-describedby": "cancel-lines-help" } }}
                          />
                        }
                        // body2, as the rest of the dialog and the prototype's own checkbox
                        // label (agent-trip.jsx); a bare string label renders body1.
                        label={
                          <Typography component="span" variant="body2">
                            {cancelLinesCheckbox(shownLines.length)}
                          </Typography>
                        }
                      />
                      <Typography
                        id="cancel-lines-help"
                        component="p"
                        variant="caption"
                        sx={{ display: "block", color: "text.secondary" }}
                      >
                        {AGENT_COPY.cancelLinesHelp}
                      </Typography>
                    </CardContent>
                  </Card>
                )
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
                      : editing
                        ? AGENT_COPY.cancelSaveDetails
                        : AGENT_COPY.cancelConfirm}
                  </Button>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
