"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Typography from "@mui/material/Typography";

import {
  discardStatementAction,
  reconcileStatementAction,
} from "@/app/(agent)/agent/commission/import/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { STATEMENT_COPY } from "@/lib/agent/content";
import type { StatementActionState } from "@/lib/agent/statementForm";

/**
 * "Mark as reconciled" and "Discard statement": each a button that opens a confirmation, the
 * shape `CommissionRemoveButton` set.
 *
 * Reconcile is the one step that changes the ledger, and many lines at once, so it says what
 * it is about to do — how many payments, how many new lines — and that paid lines stay as
 * they are. Discard says the opposite: nothing changed, and the file can come back.
 *
 * The confirm button disables while it works, so a double click is one request. A refusal is
 * shown in the dialog rather than closing it over a page that did not change.
 */
export function StatementConfirmButton({
  kind,
  importId,
  version,
  label,
  body,
  disabled = false,
  describedBy,
}: {
  kind: "reconcile" | "discard";
  importId: string;
  version: number;
  label: string;
  body: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const action = kind === "reconcile" ? reconcileStatementAction : discardStatementAction;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StatementActionState, FormData>(action, {});
  const titleId = `statement-${kind}-title`;

  // A refused reconcile refreshes the page behind, which disables this button (a row needs the
  // advisor again). The dialog closes with it: left open, it offered a confirm the server
  // would refuse. Derived, not an effect, so there is no second render.
  const isOpen = open && !disabled;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <>
      <Button
        type="button"
        variant={kind === "reconcile" ? "filled" : "text"}
        size="sm"
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <Dialog
        open={isOpen}
        onClose={() => { if (!pending) setOpen(false); }}
        aria-labelledby={titleId}
        maxWidth="xs"
        fullWidth
      >
        <DialogContent>
          <Typography id={titleId} component="h2" variant="h6" sx={{ m: 0 }}>
            {kind === "reconcile" ? STATEMENT_COPY.reconcileConfirmTitle : STATEMENT_COPY.discardTitle}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {body}
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
            <input type="hidden" name="importId" value={importId} />
            <input type="hidden" name="version" value={version} />
            <Button type="button" variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
              {kind === "reconcile" ? STATEMENT_COPY.reconcileKeep : STATEMENT_COPY.discardKeep}
            </Button>
            <Button type="submit" variant={kind === "reconcile" ? "filled" : "danger"} disabled={pending}>
              {pending
                ? STATEMENT_COPY.working
                : kind === "reconcile"
                  ? STATEMENT_COPY.markReconciled
                  : STATEMENT_COPY.discardConfirm}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
