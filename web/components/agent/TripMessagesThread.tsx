import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { AGENT_COPY } from "@/lib/agent/content";
import type { TripMessageRow } from "@/lib/agent/tripDetail";

/**
 * Read-only in this pass — composing and sending a new message is §3.10. `is_internal_note`
 * rows ARE included (the agent's own read, unlike the client's) and are visually distinguished
 * rather than hidden.
 */
export function TripMessagesThread({ messages }: { messages: TripMessageRow[] }) {
  if (messages.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {AGENT_COPY.tripMessagesEmpty}
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
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
