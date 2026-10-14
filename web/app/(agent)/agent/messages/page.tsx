import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";

/**
 * Screen 3.10.1 — Agent Inbox. §4.4 Pattern B, master-detail from `lg` (A3101_AgentInbox).
 *
 * The list is the `@list` slot beside this; this is the right pane before a thread is picked,
 * shown from `lg` only (below it the list is the whole page).
 */
export const metadata = { title: "Messages" };

export default function AgentMessagesPage() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", height: "100%", minHeight: 320, px: 3 }}>
      <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
        {AGENT_MESSAGES_COPY.pickThread}
      </Typography>
    </Box>
  );
}
