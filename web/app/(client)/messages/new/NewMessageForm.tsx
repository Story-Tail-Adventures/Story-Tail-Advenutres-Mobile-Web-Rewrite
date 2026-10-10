"use client";

import { useActionState, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { BODY_S, BTN_44, BTN_SM, advisorAvatarSx } from "@/components/client/client-sx";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { TextareaField } from "@/components/ui/Textarea";
import { TAP_TARGET } from "@/lib/mui/sx";
import { startConversation } from "@/lib/messages/actions";
import { MESSAGES } from "@/lib/messages/content";
import { THREAD_MESSAGES, type SendMessageState } from "@/lib/trips/thread";

const IDLE: SendMessageState = { status: "idle" };

/**
 * Screen 2.6.3's form.
 *
 * NOT THE COMPOSE BAR. 2.6.2's composer is a one-line reply that grows; this is a page whose
 * whole purpose is one message, and the artboard draws it as a card with a 140px field. They
 * share an action shape and nothing else, so sharing the component would mean a prop for
 * every difference.
 *
 * THERE IS NO SUBJECT FIELD, which the desktop frame has. `trip-message` takes no subject —
 * it sets `conversation.subject` from the trip title, and a trip-less thread has none — so a
 * subject box would be a field that goes nowhere. The deeper reason it should not be wired up
 * either: a subject line is the first step towards a structured intake form, and BRD §6.5
 * (decided 2026-09-09) consolidated structured intake onto `quote-request`, which creates a
 * Trip in `inquiry`. A second intake queue is exactly what that decision removed. The thread
 * is named for the person instead — see `inboxTitle`.
 *
 * ON SUCCESS THE ACTION REDIRECTS into the new thread, so this component never renders a
 * "sent" state; what it renders is pending, and then the page is gone.
 *
 * The draft survives a failure the same way 2.6.2's does, and for the same reason: this is
 * likely the longest message anybody writes in the app, and losing it would be the worst
 * moment in the section to lose one.
 *
 * ON MUI (step 2 of the migration): the card IS the form (`Card component="form"`), the
 * field is the shared TextareaField, and the error is the MUI Alert tint.
 */
export function NewMessageForm() {
  const [state, action, pending] = useActionState(startConversation, IDLE);
  const [typed, setTyped] = useState<string | null>(null);

  const draft = typed ?? (state.status === "error" ? state.draft : "");
  const empty = draft.trim().length === 0;

  return (
    <Card component="form" action={action} onSubmit={() => setTyped(null)} sx={{ p: { xs: 2.5, md: 3 } }}>
      {/* The advisor card the frame opens with, minus the presence dot and the "< 2h"
          promise — see the header of lib/messages/content.ts for why there is exactly one
          reply-time string in this codebase. */}
      <Paper
        elevation={0}
        sx={{
          mb: 2,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          p: 1.5,
          bgcolor: "secondary.container",
          color: "secondary.onContainer",
        }}
      >
        <Avatar aria-hidden="true" sx={advisorAvatarSx(36, 12)}>
          {MESSAGES.advisorInitials}
        </Avatar>
        <Typography component="p" variant="body2" sx={BODY_S}>
          <b>{MESSAGES.advisorName}</b> · {MESSAGES.replyWindow}
        </Typography>
      </Paper>

      <TextareaField
        id="body"
        name="body"
        label={MESSAGES.newBodyLabel}
        value={draft}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={MESSAGES.newPlaceholder}
        rows={7}
      />

      {state.status === "error" && (
        <Box sx={{ mt: 1 }}>
          <Alert tone="error">{state.message}</Alert>
        </Box>
      )}

      <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
        {/* Departure 10: a thread with no trip has nothing it could attach. `trip-document`
            hard-requires a tripId and is the only insert into `document` in the repo, so the
            filter in `trip-message` would drop anything sent from here. It turns on with the
            account-scoped upload endpoint recorded against §2.5.4. */}
        {/* The button keeps the artboard's own label and the REASON sits beside it as visible
            text, rather than the reason becoming the label. A sentence-long button reads as a
            rendering fault, and a `title` tooltip alone is unreachable on a touch screen —
            which is most of this app. Same shape §2.5's disabled settings rows use. */}
        <MuiButton
          type="button"
          variant="outlined"
          color="secondary"
          size="small"
          disabled
          aria-disabled="true"
          startIcon={<Icon name="attach" size={13} />}
          sx={{ ...BTN_SM, ...TAP_TARGET }}
        >
          {THREAD_MESSAGES.attachLabel}
        </MuiButton>
        <Typography
          component="span"
          variant="body2"
          sx={{ ...BODY_S, display: { xs: "none", md: "inline" }, color: "text.secondary" }}
        >
          {MESSAGES.attachDeferred}
        </Typography>

        <MuiButton
          type="submit"
          variant="contained"
          disabled={pending || empty}
          startIcon={pending ? <Spinner /> : <Icon name="send" size={14} />}
          sx={{ ...BTN_44, ...TAP_TARGET, ml: "auto" }}
        >
          {pending ? MESSAGES.newSending : MESSAGES.newSend}
        </MuiButton>
      </Box>
    </Card>
  );
}
