"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";

import { removeLineAction, type RemoveState } from "@/app/(agent)/agent/commission/ledger/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { COMMISSION_COPY } from "@/lib/agent/content";

/**
 * Remove a line entered by mistake — only offered when the server says it may be removed
 * (`can_remove`: never on the record; Gyasi, 2026-10-11).
 *
 * A CONFIRMATION, because it leaves the ledger and every total at once. Removal is soft and
 * audited, so it is not irreversible in the database — but nothing on screen brings a
 * removed line back, and a confirm is cheaper than a support request.
 *
 * THE CONFIRM BUTTON DISABLES WHILE IT WORKS, so a double click is one request, not two (the
 * second would come back stale). A refusal is shown in the dialog rather than closing it over
 * an unchanged line.
 */
export function CommissionRemoveButton({
  commissionId,
  tripId,
  version,
}: {
  commissionId: string;
  tripId: string;
  version: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RemoveState, FormData>(removeLineAction, {});

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <>
      <Button type="button" variant="text" onClick={() => setOpen(true)} fullWidth>
        {COMMISSION_COPY.removeLine}
      </Button>
      <Dialog
        open={open}
        onClose={() => { if (!pending) setOpen(false); }}
        aria-labelledby="remove-line-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogContent>
          <Typography id="remove-line-title" component="h2" variant="h6" sx={{ m: 0 }}>
            {COMMISSION_COPY.removeTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {COMMISSION_COPY.removeBody}
          </Typography>
          {state.formError && (
            <Box sx={{ mt: 1.5 }}>
              <Alert tone="error">{state.formError}</Alert>
            </Box>
          )}
          <Box
            component="form"
            action={formAction}
            onSubmit={onSubmit}
            sx={{ mt: 2, display: "flex", gap: 1, justifyContent: "flex-end" }}
          >
            <input type="hidden" name="commissionId" value={commissionId} />
            <input type="hidden" name="tripId" value={tripId} />
            <input type="hidden" name="version" value={version} />
            <Button type="button" variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
              {COMMISSION_COPY.removeKeep}
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? COMMISSION_COPY.saving : COMMISSION_COPY.removeConfirm}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
