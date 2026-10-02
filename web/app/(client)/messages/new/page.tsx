import type { Metadata } from "next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import {
  BACK_LINK_SX,
  BODY,
  HEADLINE,
  MAX_W_2XL,
  pageSx,
} from "@/components/client/client-sx";
import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages/content";
import { NewMessageForm } from "./NewMessageForm";

export const metadata: Metadata = { title: MESSAGES.newTitle };

/**
 * Screen 2.6.3 New Conversation — docs/Screen-Inventory.md §2.6.3, §4.4 (Pattern **A**), and
 * design/source-prototype/screens/client-messaging.jsx (C263_NewConversation) +
 * client-messaging-mobile.jsx (M263_NewConversation). P1.
 *
 * THIS SCREEN IS WHY THE EDGE FUNCTION CHANGED. Every other message in the app is addressed
 * by trip; this one is written before a trip exists, so `trip-message` had to learn to
 * find-or-create against `trip_id IS NULL`. Sending neither a tripId nor a conversationId is
 * what asks for that, and it is deliberately the ONLY way to reach the general thread — so a
 * traveler who writes twice lands in one conversation rather than two.
 *
 * "Use a template" from the frame is absent: `message_template` belongs to the agent (§3.10),
 * and a client-side template picker is a different feature nobody has specified. Departure 6.
 *
 * The subtitle must not promise a quote — see the note in `NewMessageForm`.
 */
export default function NewConversationPage() {
  return (
    <Box sx={pageSx(MAX_W_2XL)}>
      <MuiButton
        component={NextLink}
        href="/messages"
        variant="text"
        size="small"
        startIcon={<Icon name="arrow_left" size={14} />}
        sx={BACK_LINK_SX}
      >
        {MESSAGES.backToMessages}
      </MuiButton>

      <Typography component="h1" variant="h5" sx={HEADLINE}>
        {MESSAGES.newTitle}
      </Typography>
      <Typography component="p" variant="body2" sx={{ ...BODY, mt: 0.5, mb: 2, color: "text.secondary" }}>
        {MESSAGES.newSubtitle}
      </Typography>

      <NewMessageForm />
    </Box>
  );
}
