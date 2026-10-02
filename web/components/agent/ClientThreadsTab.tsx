import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientThread } from "@/lib/agent/clientDetail";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.3.5 — every conversation with this client.
 *
 * THREAD LIST ONLY. The thread BODY is §3.10.2 and is not built, so rows are not links:
 * §3.2.1's rule, that a row wired to nothing is worse than a row that is plainly a list
 * item. The unread badge is real — `conversation.agent_unread_count` is outside the client
 * grant, which is part of why this tab needs an accessor at all.
 *
 * ON MUI (step 2 of the migration, PR 6), as the A335 artboard draws it: a Card per thread,
 * the message glyph in primary, and the unread count as a 20px brand Chip. Plain sx, so this
 * stays a Server Component.
 */

/** A single-line text that clips rather than wraps, as the legacy `truncate` did. */
const TRUNCATE = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function ClientThreadsTab({ threads }: { threads: ClientThread[] }) {
  if (threads.length === 0) {
    return (
      <Typography component="p" variant="body2" sx={{ px: 0.5, py: 2, color: "text.secondary" }}>
        {CLIENT_COPY.threadsEmpty}
      </Typography>
    );
  }

  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
      {threads.map((t) => (
        <Card component="li" key={t.conversationId}>
          <CardContent
            sx={{ px: 1.75, py: 1.5, display: "flex", alignItems: "center", gap: 1.5, "&:last-child": { pb: 1.5 } }}
          >
            <Box sx={{ display: "inline-flex", flexShrink: 0, color: "primary.main" }}>
              <Icon name="message" size={16} />
            </Box>
            <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="span" variant="subtitle1" sx={{ ...TRUNCATE, fontWeight: 600, lineHeight: 1.3 }}>
                {t.subject}
              </Typography>
              <Typography component="span" variant="caption" sx={{ ...TRUNCATE, color: "text.secondary" }}>
                {t.preview ?? `${t.messageCount} messages`}
              </Typography>
            </Box>
            <Typography component="span" variant="caption" sx={{ flexShrink: 0, color: "text.secondary" }}>
              {t.whenLabel}
            </Typography>
            {t.unread > 0 && (
              <Chip
                size="small"
                color="brand"
                sx={{ height: 20, flexShrink: 0, fontWeight: 700 }}
                label={
                  <>
                    {t.unread}
                    <Box component="span" sx={VISUALLY_HIDDEN}> {CLIENT_COPY.threadUnreadLabel}</Box>
                  </>
                }
              />
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
