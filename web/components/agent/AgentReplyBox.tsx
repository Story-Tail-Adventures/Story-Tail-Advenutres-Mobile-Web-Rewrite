"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import { sendAgentMessageAction, type SendResult } from "@/app/(agent)/agent/messages/actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TextareaField } from "@/components/ui/Textarea";
import { AGENT_MESSAGES_COPY, messagesNoLogin } from "@/lib/agent/content";
import { threadHref } from "@/lib/agent/messageQuery";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { uuidV7 } from "@/lib/uuid";

/**
 * How long a draft keeps its message id for a retry of the same words: well inside the Edge
 * Function's one-hour window for a client-minted v7 (Data-Model §21.6). After that a retry
 * gets a fresh id rather than "out of date".
 */
const REUSE_ID_MS = 30 * 60 * 1000;

type Draft = { id: string; body: string; note: boolean; at: number };

/**
 * Screen 3.10.2's reply box (A3101's compose bar): the message, the "Internal note" switch,
 * and Send. Stage 2 adds the template picker the artboard draws on the left.
 *
 * CONTROLLED, AND NOT A `<form action>`. React 19 resets a form after its action runs, and a
 * refused send must keep every word typed (the Stage 2 commission lesson). The switch is part
 * of what is kept: a refused note must not come back as a reply.
 *
 * ONE ID PER DRAFT. The id is minted on the first send of these words and reused for a retry
 * of the same ones, so a double click, or a retry after a send that landed but answered with
 * an error, is stored once (the second is refused as already sent).
 *
 * ADDRESSED TWO WAYS. In a thread it writes to that thread, reading it up to `seenUpTo` (the
 * newest message on screen). On "Message client" it writes to the client (and trip), which
 * finds their live thread or starts one, and then it goes there. A new thread cannot start
 * with a note (the client would see a thread with nothing in it), so the switch is not
 * offered there.
 *
 * A NOTE LOOKS LIKE A NOTE BEFORE IT IS SENT: tinted, a dashed edge, a lock, and a line that
 * says only the advisor sees it. Typing a private note into what looks like a reply box is
 * the mistake this screen most needs to prevent.
 */
export function AgentReplyBox({
  conversationId,
  clientId,
  tripId,
  seenUpTo = null,
  clientFirstName,
  clientCanSignIn,
}: {
  conversationId?: string;
  clientId?: string;
  tripId?: string | null;
  seenUpTo?: string | null;
  clientFirstName: string;
  clientCanSignIn: boolean;
}) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const draft = useRef<Draft | null>(null);
  const router = useRouter();
  const fieldId = useId();
  const noLoginId = useId();
  const noteHintId = useId();
  const inThread = Boolean(conversationId);
  const noteOn = inThread && note;

  function idFor(text: string, isNote: boolean): string {
    const now = Date.now();
    const d = draft.current;
    if (d && d.body === text && d.note === isNote && now - d.at < REUSE_ID_MS) return d.id;
    draft.current = { id: uuidV7(), body: text, note: isNote, at: now };
    return draft.current.id;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim() === "" || pending) return;
    setError(null);
    setStatus("");
    const isNote = noteOn;
    const messageId = idFor(body, isNote);
    startTransition(async () => {
      let result: SendResult;
      try {
        result = await sendAgentMessageAction({
          conversationId,
          clientId,
          tripId,
          messageId,
          seenUpTo,
          body,
          internalNote: isNote,
        });
      } catch {
        // The action itself failed to run (offline, a deploy mid-request): the words stay.
        result = { ok: false, message: AGENT_MESSAGES_COPY.sendFailed };
      }
      if (!result.ok) {
        setError(result.message);
        document.getElementById(fieldId)?.focus();
        return;
      }
      draft.current = null;
      setBody("");
      setNote(false);
      setStatus(isNote ? AGENT_MESSAGES_COPY.noteAdded : AGENT_MESSAGES_COPY.sent);
      if (inThread) {
        // The action's revalidation re-renders the thread; Send was disabled while it ran,
        // so focus goes back where the next message is typed.
        document.getElementById(fieldId)?.focus();
      } else {
        // REPLACE, not push: Back from the new thread should not land on "new message",
        // which would only send them forward to the thread again.
        router.replace(threadHref(result.conversationId));
      }
    });
  }

  const label = noteOn ? AGENT_MESSAGES_COPY.noteSwitch : inThread ? AGENT_MESSAGES_COPY.replyLabel : AGENT_MESSAGES_COPY.messageLabel;
  const placeholder = noteOn
    ? AGENT_MESSAGES_COPY.notePlaceholder
    : inThread
      ? AGENT_MESSAGES_COPY.replyPlaceholder
      : AGENT_MESSAGES_COPY.messagePlaceholder;

  return (
    <Box
      component="form"
      onSubmit={submit}
      aria-label={inThread ? AGENT_MESSAGES_COPY.replyLabel : AGENT_MESSAGES_COPY.messageLabel}
      sx={{
        px: { xs: 2, md: 2.5 },
        py: 1.5,
        borderTop: noteOn ? "2px dashed" : 1,
        borderColor: noteOn ? "outline.main" : "divider",
        bgcolor: noteOn ? "surface.2" : "background.default",
      }}
    >
      {error && (
        <Typography component="p" variant="body2" role="alert" sx={{ m: 0, mb: 1, color: "error.main" }}>
          {error}
        </Typography>
      )}
      {/* Always in the page, so "Sent" is announced when it changes rather than missed. */}
      <Box component="span" role="status" sx={VISUALLY_HIDDEN}>
        {status}
      </Box>
      <TextareaField
        id={fieldId}
        label={label}
        rows={3}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        // Read-only, not disabled, while it sends: a disabled field drops focus to the page.
        readOnly={pending}
        describedBy={noteOn ? noteHintId : !clientCanSignIn ? noLoginId : undefined}
      />
      {noteOn && (
        <Typography
          id={noteHintId}
          component="p"
          variant="caption"
          sx={{ m: 0, mt: 0.75, display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
        >
          <Icon name="lock" size={12} />
          {AGENT_MESSAGES_COPY.noteHint}
        </Typography>
      )}
      <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {inThread && (
          <FormControlLabel
            control={<Switch size="small" checked={note} onChange={(e) => setNote(e.target.checked)} disabled={pending} />}
            label={<Typography component="span" variant="body2">{AGENT_MESSAGES_COPY.noteSwitch}</Typography>}
          />
        )}
        <Box sx={{ ml: "auto" }}>
          <Button type="submit" variant="filled" size="sm" disabled={pending || body.trim() === ""}>
            {pending ? AGENT_MESSAGES_COPY.sending : noteOn ? AGENT_MESSAGES_COPY.addNote : AGENT_MESSAGES_COPY.send}
          </Button>
        </Box>
      </Box>
      {!clientCanSignIn && !noteOn && (
        <Typography id={noLoginId} component="p" variant="caption" sx={{ display: "block", mt: 0.75, color: "text.secondary" }}>
          {messagesNoLogin(clientFirstName)}
        </Typography>
      )}
    </Box>
  );
}
