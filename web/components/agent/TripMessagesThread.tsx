import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Icon } from "@/components/ui/Icon";
import { AGENT_COPY, AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import type { TripMessageRow } from "@/lib/agent/tripDetail";

/** The 32px small button, as Client Detail's header draws its links. */
const BTN_SM = { minHeight: 32, px: "16px", gap: 1, whiteSpace: "nowrap" } as const;

/**
 * A read of the trip's thread. Replying happens in the thread itself (§3.10.2), which the
 * button above opens, or starts when there is none yet. `is_internal_note` rows ARE included
 * (the agent's own read, unlike the client's) and are visually distinguished rather than hidden.
 */
export function TripMessagesThread({ messages, replyHref }: { messages: TripMessageRow[]; replyHref: string }) {
  const reply = (
    <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
      <MuiButton component={NextLink} href={replyHref} variant="outlined" color="secondary" size="small" sx={BTN_SM}>
        <Icon name="message" size={12} /> {AGENT_MESSAGES_COPY.openInMessages}
      </MuiButton>
    </Box>
  );

  if (messages.length === 0) {
    return (
      <>
        {reply}
        <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
          {AGENT_COPY.tripMessagesEmpty}
        </Typography>
      </>
    );
  }

  return (
    <Stack spacing={1}>
      {reply}
      {messages.map((m) => (
        <Card key={m.messageId} sx={m.isInternalNote ? { bgcolor: "surface.2" } : undefined}>
          <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="overline" sx={{ color: "text.secondary", lineHeight: 1.3 }}>
                {m.senderRole === "agent" ? "You" : m.senderRole === "client" ? "Client" : m.senderRole}
              </Typography>
              {m.isInternalNote && <Chip size="small" variant="outlined" label="Internal note" />}
              <Typography variant="caption" sx={{ ml: "auto", color: "text.secondary" }}>
                {m.createdLabel}
              </Typography>
            </Box>
            <Typography component="p" variant="body2" sx={{ mt: 0.5 }}>
              {m.body}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
