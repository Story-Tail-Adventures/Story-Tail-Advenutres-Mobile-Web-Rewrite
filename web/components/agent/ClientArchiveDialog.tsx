"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { setClientArchivedAction } from "@/app/(agent)/agent/clients/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import { CLIENT_COPY } from "@/lib/agent/content";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.3.12 — Archive, and its other half.
 *
 * §4.4 Pattern J on MUI's Dialog (MUI everywhere, 2026-10-01), where it was the native
 * `<dialog>` with `showModal()`. The Modal brings what the native element did — focus
 * trapping, Escape-to-dismiss, an inert background — plus focus returned to the button that
 * opened it on any close, including the programmatic one after a successful write. It
 * renders in a portal on document.body, so tests query it with `screen`, not `container`.
 * What it gives up is opening with JavaScript off, accepted in that ruling. Every step is
 * the one it was: open, read the consequence, optionally say why, confirm, and the same
 * server action with the same arguments.
 *
 * RESTORE IS NOT DRAWN ANYWHERE IN THE PROTOTYPE. `A3312_Archive` is the archive
 * confirmation only, and the sole hint that the other direction exists is the roster's
 * "Archived" filter chip. It is the same dialog with the eyebrow, the body and the verb
 * flipped, and no reason field — a restore has nothing to explain, where an archive is a
 * decision somebody may need to account for later.
 *
 * THE REASON IS STORED IN THE AUDIT ROW, not on the client. `client` has no column for it.
 * That is where "why was this record archived" belongs anyway, and without a home there the
 * sentence the advisor just typed would be discarded the moment the dialog closed.
 *
 * NOT `variant="danger"`. The prototype uses a tonal button and it is right: archiving is
 * reversible, keeps every trip and every audit row, and the dialog says so. Red is for
 * things that do not come back.
 */

/** The legacy `w-[min(520px,calc(100vw-2rem))]` paper, 16px off the viewport edge. */
const PAPER_SX = { m: 2, width: "min(520px, calc(100vw - 2rem))", maxWidth: "100%" } as const;

export function ClientArchiveDialog({
  clientId,
  displayName,
  version,
  archived,
}: {
  clientId: string;
  displayName: string;
  version: number;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const restoring = archived;
  const dialogLabel = restoring ? CLIENT_COPY.restoreTitle : CLIENT_COPY.archiveTitle;

  function openDialog() {
    setError(null);
    setReason("");
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setClientArchivedAction({
        clientId,
        expectedVersion: version,
        archived: !archived,
        reason: restoring ? undefined : reason.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      // `revalidatePath` refreshes the server data; this repaints the page that is already
      // on screen so the header's own state follows the write without a reload.
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outlined" size="sm" onClick={openDialog}>
        {dialogLabel}
        <Box component="span" sx={VISUALLY_HIDDEN}> {displayName}</Box>
      </Button>

      <Dialog
        open={open}
        // Like the native <dialog> this replaced: Escape closes, a stray backdrop click does
        // not (it would throw away what was typed), and nothing closes mid-write.
        onClose={(_event, reason) => {
          if (reason !== "backdropClick" && !pending) close();
        }}
        maxWidth={false}
        slotProps={{ paper: { "aria-label": dialogLabel, sx: PAPER_SX } }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Avatar
              sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: "warning.container", color: "text.primary" }}
            >
              <Icon name={restoring ? "check" : "inbox"} size={18} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ display: "block", color: "warning.main", lineHeight: 1.3 }}>
                {restoring ? CLIENT_COPY.restoreEyebrow : CLIENT_COPY.archiveEyebrow}
              </Typography>
              <Typography component="h2" variant="h5" sx={{ m: 0, overflowWrap: "anywhere" }}>
                {restoring ? CLIENT_COPY.restoreTitle : CLIENT_COPY.archiveTitle} {displayName}?
              </Typography>
            </Box>
          </Stack>

          <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            {restoring ? CLIENT_COPY.restoreBody : CLIENT_COPY.archiveBody}
          </Typography>

          {!restoring && (
            <Box sx={{ mt: 1.5 }}>
              <TextareaField
                id="archive-reason"
                label={CLIENT_COPY.archiveReasonLabel}
                rows={2}
                placeholder={CLIENT_COPY.archiveReasonPlaceholder}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
              />
            </Box>
          )}

          {error && (
            <Typography component="p" variant="body2" role="alert" sx={{ mt: 1, color: "error.main" }}>
              {error}
            </Typography>
          )}

          <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1 }}>
            <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={close}>
              {CLIENT_COPY.formCancel}
            </Button>
            <Box sx={{ ml: "auto" }}>
              <Button type="button" variant="tonal" size="sm" disabled={pending} onClick={submit}>
                {pending
                  ? CLIENT_COPY.formSaving
                  : restoring
                    ? CLIENT_COPY.restoreConfirm
                    : CLIENT_COPY.archiveConfirm}
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
