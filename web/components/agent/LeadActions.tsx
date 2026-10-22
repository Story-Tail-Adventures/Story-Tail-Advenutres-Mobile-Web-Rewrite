"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import FormControlLabel from "@mui/material/FormControlLabel";
import MuiButton from "@mui/material/Button";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { inviteLeadAction, leadOpAction } from "@/app/(agent)/agent/leads/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextareaField } from "@/components/ui/Textarea";
import type { LeadCloseReason, LeadStatus } from "@/lib/agent/api";
import { CLOSE_REASON_LABEL, CLOSE_REASONS, LEAD_COPY } from "@/lib/agent/leadsCopy";

/**
 * Screens 3.8.2's actions, 3.8.3 Invite and 3.8.4 Close / Delete as spam (BRD §6.5,
 * 2026-10-21). The one client island on the lead page: everything it decides is the
 * `agent-lead` function's, and after each write the server page is refreshed.
 *
 * Which buttons show is the state machine of Data-Model §11.1: New and Contacted can be
 * marked, invited, closed or deleted; Closed can be reopened, invited or deleted; a Client
 * (converted, including "Already a client") offers only "Open client". Reply is always there
 * while there is anybody to reply to.
 *
 * Delete is the one `danger` button on the page: it does not come back.
 */

const PAPER_SX = { m: 2, width: "min(520px, calc(100vw - 2rem))", maxWidth: "100%" } as const;

export interface LeadActionsProps {
  leadId: string;
  status: LeadStatus;
  clientId: string | null;
  replyHref: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
}

export function LeadActions(props: LeadActionsProps) {
  const { leadId, status, clientId, replyHref } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [dialog, setDialog] = useState<"invite" | "close" | "delete" | null>(null);

  const [reason, setReason] = useState<LeadCloseReason>("no_reply");
  const [note, setNote] = useState("");
  const [first, setFirst] = useState(props.firstName);
  const [last, setLast] = useState(props.lastName ?? "");
  const [email, setEmail] = useState(props.email);
  const [dialogError, setDialogError] = useState<string | null>(null);

  function run(op: "mark_contacted" | "reopen") {
    setMessage(null);
    startTransition(async () => {
      const r = await leadOpAction({ leadId, op });
      if (!r.ok) setMessage({ tone: "error", text: r.message });
      router.refresh();
    });
  }

  function open(which: "invite" | "close" | "delete") {
    setDialogError(null);
    setMessage(null);
    setDialog(which);
  }

  function submitClose() {
    setDialogError(null);
    startTransition(async () => {
      const r = await leadOpAction({ leadId, op: "close", reason, note: note.trim() || undefined });
      if (!r.ok) {
        setDialogError(r.message);
        return;
      }
      setDialog(null);
      router.refresh();
    });
  }

  function submitDelete() {
    setDialogError(null);
    startTransition(async () => {
      // On success the action redirects to the list, so only a failure comes back.
      const r = await leadOpAction({ leadId, op: "delete_spam" });
      if (!r.ok) setDialogError(r.message);
    });
  }

  function submitInvite() {
    setDialogError(null);
    startTransition(async () => {
      const r = await inviteLeadAction({ leadId, firstName: first, lastName: last, email, phone: props.phone });
      if (!r.ok) {
        setDialogError(r.message);
        return;
      }
      setDialog(null);
      if (r.message) setMessage({ tone: "success", text: r.message });
      router.refresh();
    });
  }

  const openish = status === "new" || status === "contacted";

  return (
    <Box>
      {message && (
        <Box sx={{ mb: 1.5 }}>
          <Alert tone={message.tone}>{message.text}</Alert>
        </Box>
      )}

      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
        {status === "converted" && clientId ? (
          <MuiButton component={NextLink} href={`/agent/clients/${clientId}`} variant="contained" size="small">
            {LEAD_COPY.openClient}
          </MuiButton>
        ) : (
          <>
            <MuiButton component="a" href={replyHref} variant="contained" size="small">
              {LEAD_COPY.reply}
            </MuiButton>
            {status === "new" && (
              <Button type="button" variant="tonal" size="sm" disabled={pending} onClick={() => run("mark_contacted")}>
                {LEAD_COPY.markContacted}
              </Button>
            )}
            <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={() => open("invite")}>
              {LEAD_COPY.invite}
            </Button>
            {openish && (
              <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={() => open("close")}>
                {LEAD_COPY.close}
              </Button>
            )}
            {status === "closed" && (
              <Button type="button" variant="outlined" size="sm" disabled={pending} onClick={() => run("reopen")}>
                {LEAD_COPY.reopen}
              </Button>
            )}
            <Button type="button" variant="text" size="sm" disabled={pending} onClick={() => open("delete")}>
              {LEAD_COPY.deleteSpam}
            </Button>
          </>
        )}
      </Stack>
      {status !== "converted" && (
        <Typography component="p" variant="caption" sx={{ mt: 1, color: "text.secondary" }}>
          {LEAD_COPY.replyHint}
        </Typography>
      )}

      <Dialog
        open={dialog !== null}
        onClose={(_e, why) => {
          if (why !== "backdropClick" && !pending) setDialog(null);
        }}
        maxWidth={false}
        slotProps={{
          paper: {
            "aria-label":
              dialog === "invite" ? LEAD_COPY.inviteTitle : dialog === "close" ? LEAD_COPY.closeTitle : LEAD_COPY.deleteTitle,
            sx: PAPER_SX,
          },
        }}
      >
        <DialogContent sx={{ p: 2.5 }}>
          {dialog === "invite" && (
            <>
              <Typography component="h2" variant="h5" sx={{ m: 0 }}>
                {LEAD_COPY.inviteTitle}
              </Typography>
              <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                {LEAD_COPY.inviteBody}
              </Typography>
              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 1.25 }}>
                <Field id="invite-first" label={LEAD_COPY.firstName} value={first} required onChange={(e) => setFirst(e.target.value)} />
                <Field
                  id="invite-last"
                  label="Last name"
                  value={last}
                  required
                  hint={LEAD_COPY.inviteLastNameHint}
                  onChange={(e) => setLast(e.target.value)}
                />
              </Box>
              <Box sx={{ mt: 1 }}>
                <Field id="invite-email" type="email" label={LEAD_COPY.email} value={email} required onChange={(e) => setEmail(e.target.value)} />
              </Box>
            </>
          )}

          {dialog === "close" && (
            <>
              <Typography component="h2" variant="h5" sx={{ m: 0 }}>
                {LEAD_COPY.closeTitle}
              </Typography>
              <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                {LEAD_COPY.closeBody}
              </Typography>
              <Typography component="p" variant="caption" sx={{ mt: 1.5, display: "block", color: "text.secondary" }} id="close-reason-label">
                {LEAD_COPY.closeReasonLabel}
              </Typography>
              <RadioGroup
                aria-labelledby="close-reason-label"
                value={reason}
                onChange={(e) => setReason(e.target.value as LeadCloseReason)}
              >
                {CLOSE_REASONS.map((r) => (
                  <FormControlLabel key={r} value={r} control={<Radio size="small" />} label={CLOSE_REASON_LABEL[r]} />
                ))}
              </RadioGroup>
              <Box sx={{ mt: 1 }}>
                <TextareaField
                  id="close-note"
                  label={LEAD_COPY.closeNoteLabel}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Box>
            </>
          )}

          {dialog === "delete" && (
            <>
              <Typography component="h2" variant="h5" sx={{ m: 0 }}>
                {LEAD_COPY.deleteTitle}
              </Typography>
              <Typography component="p" variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                {LEAD_COPY.deleteBody}
              </Typography>
            </>
          )}

          {dialogError && (
            <Box sx={{ mt: 1.5 }}>
              <Alert tone="error">{dialogError}</Alert>
            </Box>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}>
            <Button type="button" variant="text" size="sm" disabled={pending} onClick={() => setDialog(null)}>
              {LEAD_COPY.cancel}
            </Button>
            {dialog === "invite" && (
              <Button type="button" variant="filled" size="sm" disabled={pending} onClick={submitInvite}>
                {LEAD_COPY.inviteSend}
              </Button>
            )}
            {dialog === "close" && (
              <Button type="button" variant="filled" size="sm" disabled={pending} onClick={submitClose}>
                {LEAD_COPY.closeConfirm}
              </Button>
            )}
            {dialog === "delete" && (
              <Button type="button" variant="danger" size="sm" disabled={pending} onClick={submitDelete}>
                {LEAD_COPY.deleteConfirm}
              </Button>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
