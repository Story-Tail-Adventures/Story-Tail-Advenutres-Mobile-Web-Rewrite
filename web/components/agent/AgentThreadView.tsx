import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AgentReplyBox } from "@/components/agent/AgentReplyBox";
import { ThreadArchiveButton } from "@/components/agent/ThreadArchiveButton";
import { ThreadOpened } from "@/components/agent/ThreadOpened";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import { inboxHref, type InboxQuery } from "@/lib/agent/messageQuery";
import type { ThreadMessageView, ThreadView } from "@/lib/agent/messages";
import type { PickerData } from "@/lib/agent/templateLibrary";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { formatMessageTime, groupMessagesByDay } from "@/lib/trips/thread";

/**
 * Screen 3.10.2 (A3102_AgentThread, which the artboard draws as A3101's right pane): the
 * header, the messages by day, and the reply box.
 *
 * THE ADVISOR'S SIDE OF THE CLIENT'S THREAD, so the bubbles swap sides: the advisor's own on
 * the right in primary, the client's on the left, outlined. Same shapes as the traveler's
 * `ThreadMessages`, which is written for the traveler (its "mine" is the client and its
 * attachments link to their library) and so is not shared.
 *
 * AN INTERNAL NOTE LOOKS LIKE NOTHING THE CLIENT SENT OR RECEIVED: a dashed, tinted card on
 * the advisor's side, labelled every time. It is the one thing on this screen the client
 * never sees, and it must not be mistaken for a reply.
 *
 * ATTACHMENTS ARE NAMED, NOT LINKED. Nothing on the advisor's side can open a document yet
 * (Client Detail's Documents tab says the same); the client's own library is where files open.
 *
 * THREE ROWS IN THE PANE'S HEIGHT: the header, the messages (the only part that scrolls),
 * and the reply box, which sits under the messages rather than over them, so the newest
 * message is never behind it.
 */
export function AgentThreadView({
  thread,
  query,
  picker = null,
  replyReady = false,
}: {
  thread: ThreadView;
  query: InboxQuery;
  picker?: PickerData | null;
  /** Focus the reply box on open: the thread was opened from a notification. */
  replyReady?: boolean;
}) {
  const { header, messages } = thread;
  const days = groupMessagesByDay(messages, thread.timeZone);
  const last = messages[messages.length - 1] ?? null;

  return (
    <Box component="section" aria-label={header.clientName} sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 2.5 }, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <MuiLink
          component={NextLink}
          href={inboxHref(query)}
          underline="hover"
          variant="body2"
          sx={{ display: { xs: "inline-flex", lg: "none" }, mb: 1 }}
        >
          {AGENT_MESSAGES_COPY.backToInbox}
        </MuiLink>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
            <Typography component="h1" variant="h6" sx={{ m: 0, overflowWrap: "anywhere" }}>
              {header.clientName}
            </Typography>
            <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
              {header.tripLabel}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }} useFlexGap>
            {header.archived && <Chip size="small" variant="outlined" label={AGENT_MESSAGES_COPY.archivedTag} />}
            {header.overdue && <Chip size="small" color="error" variant="outlined" label={AGENT_MESSAGES_COPY.overdue} />}
            {header.replyByLabel && <Chip size="small" variant="outlined" label={header.replyByLabel} />}
            {header.tripId ? (
              <MuiButton component={NextLink} href={`/agent/trips/${header.tripId}`} variant="outlined" color="secondary" size="small" sx={BTN_SM}>
                <Icon name="briefcase" size={12} /> {AGENT_MESSAGES_COPY.openTrip}
              </MuiButton>
            ) : (
              <MuiButton component={NextLink} href={`/agent/clients/${header.clientId}`} variant="outlined" color="secondary" size="small" sx={BTN_SM}>
                <Icon name="user" size={12} /> {AGENT_MESSAGES_COPY.openClient}
              </MuiButton>
            )}
            <ThreadArchiveButton conversationId={header.conversationId} archived={header.archived} />
          </Stack>
        </Box>
      </Box>

      {/* Focusable, so a keyboard can scroll it (a scroll region nothing can reach is a trap). */}
      <Box
        role="region"
        tabIndex={0}
        aria-label={AGENT_MESSAGES_COPY.title}
        // Relative for the same reason as the frame's panes: the hidden sender names stay in here.
        sx={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", px: { xs: 2, md: 2.5 }, py: 2 }}
      >
        {thread.truncated && (
          <Typography component="p" variant="caption" sx={{ display: "block", mb: 1.5, textAlign: "center", color: "text.secondary" }}>
            {AGENT_MESSAGES_COPY.truncated}
          </Typography>
        )}
        {days.length === 0 ? (
          <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
            {AGENT_MESSAGES_COPY.emptyThread}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {days.map((day) => (
              <Stack key={day.key} spacing={1.25}>
                <Box sx={{ textAlign: "center" }}>
                  <Chip size="small" label={day.label} />
                </Box>
                {day.messages.map((m) => (
                  <MessageRow key={m.id} message={m} timeZone={thread.timeZone} clientFirstName={header.clientFirstName} />
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      <Box sx={{ flexShrink: 0 }}>
        <AgentReplyBox
          conversationId={header.conversationId}
          seenUpTo={thread.seenUpTo}
          clientFirstName={header.clientFirstName}
          clientCanSignIn={header.clientCanSignIn}
          picker={picker}
          focusOnOpen={replyReady}
        />
      </Box>
      <ThreadOpened conversationId={header.conversationId} lastMessageId={last?.id ?? null} seenUpTo={thread.seenUpTo} />
    </Box>
  );
}

/** The 32px small button, as Client Detail's header draws its links. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

function MessageRow({
  message,
  timeZone,
  clientFirstName,
}: {
  message: ThreadMessageView;
  timeZone: string;
  clientFirstName: string;
}) {
  const mine = message.sender === "agent";
  // Who said it, for a screen reader: sighted readers have the side and the colour.
  const sender = (
    <Box component="span" sx={VISUALLY_HIDDEN}>
      {`${mine ? AGENT_MESSAGES_COPY.senderYou : clientFirstName}: `}
    </Box>
  );
  const time = formatMessageTime(message.createdAt, timeZone);

  if (message.internalNote) {
    return (
      <Box id={`msg-${message.id}`} sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Paper
          variant="outlined"
          sx={{ maxWidth: { xs: "88%", md: "70%" }, px: 1.75, py: 1.25, borderStyle: "dashed", borderColor: "outline.main", bgcolor: "surface.2" }}
        >
          <Typography component="p" variant="overline" sx={{ m: 0, display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary", lineHeight: 1.4 }}>
            <Icon name="lock" size={12} />
            {AGENT_MESSAGES_COPY.internalNoteTag}
          </Typography>
          <Typography component="p" variant="body2" sx={{ m: 0, mt: 0.5, whiteSpace: "pre-line" }}>
            {message.body}
          </Typography>
          <Typography component="p" variant="caption" sx={{ m: 0, mt: 0.5, display: "block", color: "text.secondary", textAlign: "right" }}>
            {time}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box id={`msg-${message.id}`} sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <Box sx={{ maxWidth: { xs: "82%", md: "70%" } }}>
        <Paper
          elevation={0}
          variant={mine ? "elevation" : "outlined"}
          sx={{
            px: 1.75,
            py: 1.25,
            borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            bgcolor: mine ? "primary.main" : "background.paper",
            color: mine ? "primary.contrastText" : "text.primary",
          }}
        >
          {/* `pre-line` keeps the line breaks somebody typed. */}
          <Typography component="p" variant="body2" sx={{ m: 0, whiteSpace: "pre-line", color: "inherit" }}>
            {sender}
            {message.body}
          </Typography>
        </Paper>
        {message.attachments.length > 0 && (
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.5, display: "flex", flexDirection: "column", gap: 0.5, alignItems: mine ? "flex-end" : "flex-start" }}>
            {message.attachments.map((a) => (
              <Paper component="li" key={a.id} variant="outlined" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, py: 0.5, maxWidth: "100%" }}>
                <Icon name="attach" size={12} />
                <Typography component="span" variant="caption" noWrap sx={{ minWidth: 0 }}>
                  {a.filename}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}
        <Typography component="p" variant="caption" sx={{ m: 0, mt: 0.25, display: "block", color: "text.secondary", textAlign: mine ? "right" : "left" }}>
          {time}
          {/* §3.10 Stage 4: an email carried this reply, or the client answered by email. */}
          {mine && message.autoReply && ` · ${AGENT_MESSAGES_COPY.autoReply}`}
          {mine && message.emailed && ` · ${AGENT_MESSAGES_COPY.emailedMark}`}
          {!mine && message.byEmail && ` · ${AGENT_MESSAGES_COPY.byEmail}`}
        </Typography>
      </Box>
    </Box>
  );
}
