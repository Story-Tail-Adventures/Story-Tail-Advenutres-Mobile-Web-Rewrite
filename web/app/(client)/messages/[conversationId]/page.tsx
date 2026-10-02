import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";

import {
  BODY_S,
  BTN_SM,
  ICON_BTN_SX,
  INBOX_PANE_SX,
  MAX_W_3XL,
  THREAD_HEADER_SX,
  THREAD_ROW_SX,
  TITLE_S,
  advisorAvatarSx,
} from "@/components/client/client-sx";
import { InboxList } from "@/components/client/messages/InboxList";
import { Composer } from "@/components/client/thread/Composer";
import { ThreadMessages } from "@/components/client/thread/ThreadMessages";
import { ThreadScroll } from "@/components/client/thread/ThreadScroll";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { sendConversationMessage } from "@/lib/messages/actions";
import { MESSAGES } from "@/lib/messages/content";
import { inboxRows } from "@/lib/messages/inbox";
import { loadConversationThread, loadInbox } from "@/lib/messages/queries";
import { currentPlatformUser } from "@/lib/trips/queries";
import { THREAD_MESSAGES } from "@/lib/trips/thread";

export const metadata: Metadata = { title: MESSAGES.title };

/**
 * Screen 2.6.2 Conversation Thread — docs/Screen-Inventory.md §2.6.2, §4.4 (Pattern **C**,
 * "Mobile is full-screen"), and design/source-prototype/screens/client-messaging.jsx
 * (C262_ConversationThread) + client-messaging-mobile.jsx (M262_ConversationThread). P1.
 *
 * IT IS 2.2.7 WITH A DIFFERENT HEADER, which is what the mobile artboard requires in so many
 * words. The scroll, the bubbles, the day separators, the attachment chips and the compose bar
 * are the same four components that route mounts; what differs is where Back goes, what the
 * title says, whether "Open trip" is there at all, and which action the composer is bound to.
 *
 * WHY IT IS NOT LITERALLY THAT ROUTE. `/trips/[tripId]/messages` resolves the conversation
 * FROM a trip, and the thread 2.6.3 creates has `trip_id IS NULL`. There is no trip id that
 * reaches it, so the screens that most need this one — a traveler with no trip yet — would
 * 404 on every thread they own. Addressing by conversation is the whole point of the section.
 *
 * THE LIST STAYS BESIDE IT at `web:`, so master-detail is a real two-pane rather than a
 * full-page swap. Below that breakpoint the thread is the whole screen, which is the push
 * §4.4 specifies.
 *
 * ABSENT, all recorded as departures in client-messaging-mobile.jsx: the presence dot
 * (nothing backs it), "· Read" under a sent message (`message.read_by_other_at` is withheld
 * from the client grant on purpose), reactions (no entity, none specified), and the overflow
 * menu, whose only drawn item was the archive action §2.6.1 does not have either.
 */
export default async function ConversationThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [thread, conversations, me] = await Promise.all([
    loadConversationThread(conversationId),
    loadInbox(),
    currentPlatformUser(),
  ]);

  // No row, not yours, and archived are one answer here, exactly as they are in the Edge
  // Function: `conversation_self_select` makes all three invisible, so none of them can be
  // told apart and none of them should be.
  if (!thread) notFound();

  const rows = conversations ? inboxRows(conversations, me.timeZone) : [];

  return (
    <Box className="client-fill" sx={{ display: "flex" }}>
      {/* Hidden below `web` — at that width the thread IS the screen and the list is the
          place Back returns to. Only `web` on these, never paired with `md`. */}
      <Box sx={{ ...INBOX_PANE_SX, display: { xs: "none", web: "flex" } }}>
        <InboxList rows={rows} activeId={thread.conversationId} />
      </Box>

      <Box sx={{ display: "flex", minHeight: 0, minWidth: 0, flex: 1, flexDirection: "column" }}>
        <Box component="header" sx={THREAD_HEADER_SX}>
          <Box sx={THREAD_ROW_SX}>
            {/* Back to the inbox, not to a trip. On `web` the list is already beside this,
                so the control is redundant there and hidden rather than made to lie about
                where it goes. */}
            <IconButton
              component={NextLink}
              href="/messages"
              aria-label={MESSAGES.backToMessages}
              sx={{ ...ICON_BTN_SX, display: { xs: "inline-flex", web: "none" } }}
            >
              <Icon name="arrow_left" size={18} />
            </IconButton>

            <Avatar aria-hidden="true" sx={advisorAvatarSx(36, 12)}>
              {MESSAGES.advisorInitials}
            </Avatar>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="p" variant="subtitle1" noWrap sx={TITLE_S}>
                {thread.title}
              </Typography>
              <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
                {MESSAGES.replyWindow}
              </Typography>
            </Box>

            {/* Only when there is a trip to open. The general thread has none, and a
                disabled button explaining that would be furniture. */}
            {thread.tripId && (
              <MuiButton
                component={NextLink}
                href={`/trips/${thread.tripId}`}
                // Named for phones, where only the icon shows.
                aria-label={THREAD_MESSAGES.openTrip}
                variant="outlined"
                color="secondary"
                size="small"
                sx={{ ...BTN_SM, flexShrink: 0 }}
              >
                <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                  {THREAD_MESSAGES.openTrip}
                </Box>
                <Box component="span" sx={{ display: { xs: "inline-flex", md: "none" } }}>
                  <Icon name="trip" size={14} />
                </Box>
              </MuiButton>
            )}
          </Box>
        </Box>

        <ThreadScroll messageCount={thread.messages.length}>
          <Box sx={{ mx: "auto", width: "100%", maxWidth: MAX_W_3XL }}>
            <ThreadMessages
              messages={thread.messages}
              timeZone={thread.timeZone}
              // A general thread has no trip library to open, so its attachments point at the
              // account-wide one (2.5.4). A trip thread keeps its own.
              documentsHref={thread.tripId ? `/trips/${thread.tripId}/documents` : "/documents"}
              // The shared default names a trip. Right on a trip thread, wrong on the one
              // kind of thread that has none.
              emptyBody={thread.tripId ? undefined : MESSAGES.threadEmptyBody}
            />
          </Box>
        </ThreadScroll>

        <Composer
          action={sendConversationMessage.bind(null, thread.conversationId)}
          attachTitle={MESSAGES.attachDeferred}
          placeholder={THREAD_MESSAGES.composePlaceholder}
        />
      </Box>
    </Box>
  );
}
