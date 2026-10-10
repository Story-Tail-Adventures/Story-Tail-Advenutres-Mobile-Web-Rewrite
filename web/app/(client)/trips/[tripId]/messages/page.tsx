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
  MAX_W_3XL,
  THREAD_HEADER_SX,
  THREAD_ROW_SX,
  TITLE_S,
  advisorAvatarSx,
} from "@/components/client/client-sx";
import { Composer } from "@/components/client/thread/Composer";
import { ThreadMessages } from "@/components/client/thread/ThreadMessages";
import { ThreadScroll } from "@/components/client/thread/ThreadScroll";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { sendTripMessage } from "@/lib/trips/actions";
import { loadTripThread } from "@/lib/trips/queries";
import { THREAD_MESSAGES } from "@/lib/trips/thread";
import { THREAD } from "./content";

export const metadata: Metadata = { title: "Messages" };

/**
 * Screen 2.2.7 Trip Messages / Conversation Thread — docs/Screen-Inventory.md §2.2.7, §4.4
 * ("mobile is full-screen"), and design/source-prototype/screens/client-trip.jsx
 * (C227_TripThread) + client-trip-mobile.jsx (M227_TripThread). P1.
 *
 * THE THREAD BODY IS NOW SHARED WITH 2.6.2, which is what this file's header promised before
 * §2.6 existed: "When §2.6 lands it mounts this route rather than copying it." It does not
 * literally mount this route — a conversation with no trip cannot be addressed by trip id, so
 * `/messages/[conversationId]` is its own route — but the parts that would drift are one
 * component each now, in `components/client/thread/`. What is left here is the header and the
 * choice of action.
 *
 * THE COMPOSE BAR IS A SIBLING OF THE SCROLL, not an overlay on it — the convention
 * `client-auth-mobile.jsx` established and the one thing that keeps a long thread from
 * hiding its own last message behind the input.
 *
 * Two things are load-bearing for that, and the screen shipped broken without the first:
 * `.client-fill` gives the root a definite height (the shell is `min-h-dvh`, so `h-full`
 * resolves against nothing and the compose bar lands below the fold — see client.css), and
 * `minHeight: 0` lets the middle region shrink below its content instead of growing the
 * column.
 *
 * TWO NAMED PRIMARY ELEMENTS ARE ABSENT, and see `web/lib/trips/thread.ts` for the full
 * reasoning: the typing indicator needs Realtime presence that nothing backs, and read
 * receipts would need `message.read_by_other_at`, which is withheld from the client column
 * grant on purpose.
 */
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const thread = await loadTripThread(tripId);

  if (!thread) notFound();

  return (
    // `.client-fill` is the shell opt-in that gives this screen a definite height — see
    // web/styles/client.css for why `h-full` alone cannot work here. With that in place the
    // header and compose bar are fixed-size flex children and the middle region scrolls.
    <Box className="client-fill" sx={{ display: "flex", flexDirection: "column" }}>
      <Box component="header" sx={THREAD_HEADER_SX}>
        <Box sx={THREAD_ROW_SX}>
          <IconButton
            component={NextLink}
            href={`/trips/${tripId}`}
            aria-label={THREAD.back}
            sx={ICON_BTN_SX}
          >
            <Icon name="arrow_left" size={18} />
          </IconButton>

          {/* The advisor's initials, matching the artboards' MAdvisorAvatar. A photograph
              would be the real thing, and there is one in the design — but the only asset
              behind it is a stock portrait, and putting a stranger's face on Gyasi is worse
              than initials. */}
          <Avatar aria-hidden="true" sx={advisorAvatarSx(36, 12)}>
            GS
          </Avatar>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="p" variant="subtitle1" noWrap sx={TITLE_S}>
              {THREAD.advisorName} · {thread.tripTitle}
            </Typography>
            <Typography component="p" variant="body2" sx={{ ...BODY_S, color: "text.secondary" }}>
              {thread.unreadCount > 0
                ? THREAD.unreadLabel(thread.unreadCount)
                : THREAD_MESSAGES.replyWindow}
            </Typography>
          </Box>

          <MuiButton
            component={NextLink}
            href={`/trips/${tripId}`}
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
        </Box>
      </Box>

      <ThreadScroll messageCount={thread.messages.length}>
        <Box sx={{ mx: "auto", width: "100%", maxWidth: MAX_W_3XL }}>
          <ThreadMessages
            messages={thread.messages}
            timeZone={thread.timeZone}
            documentsHref={`/trips/${tripId}/documents`}
          />
        </Box>
      </ThreadScroll>

      <Composer
        // Bound here rather than inside the composer, so the same bar can serve a thread that
        // has no trip to bind. See components/client/thread/Composer.tsx.
        action={sendTripMessage.bind(null, tripId)}
        attachTitle={THREAD.attachDeferred}
      />
    </Box>
  );
}
