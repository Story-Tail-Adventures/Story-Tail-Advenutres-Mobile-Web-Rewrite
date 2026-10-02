import type { Metadata } from "next";
import Box from "@mui/material/Box";

import { INBOX_PANE_SX } from "@/components/client/client-sx";
import { InboxList } from "@/components/client/messages/InboxList";
import { RetryState } from "@/components/client/RetryState";
import { EmptyState } from "@/components/client/states";
import { MESSAGES } from "@/lib/messages/content";
import { inboxRows } from "@/lib/messages/inbox";
import { loadInbox } from "@/lib/messages/queries";
import { currentPlatformUser } from "@/lib/trips/queries";
import { MESSAGES_WEB } from "./content";

export const metadata: Metadata = { title: MESSAGES.title };

/**
 * Screen 2.6.1 Messages Inbox — docs/Screen-Inventory.md §2.6.1, §4.4 (Pattern **B**:
 * master-detail on tablet landscape and web, list-only on mobile with the thread as a push),
 * and design/source-prototype/screens/client-messaging.jsx (C261_Inbox) +
 * client-messaging-mobile.jsx (M261_Inbox). P1.
 *
 * THE RIGHT PANE IS THE REAL THREAD, NOT A PREVIEW. The desktop frame draws a reduced one —
 * three bubbles, no day separators, a fake "Reply…" bar that cannot send — and building that
 * would mean a second, lesser thread renderer living next to the real one. That is precisely
 * the drift `client-messaging-mobile.jsx` warns about ("if the two drift visually, the
 * extraction never happens"). So selecting a thread navigates to `/messages/[conversationId]`,
 * which renders this same list beside the actual 2.6.2. What is here is the unselected state.
 *
 * THE ARCHIVE ACTION IS ABSENT, and this is a departure from the SPEC rather than the frame:
 * §2.6.1 lists an archive action under both Primary elements and Key actions, but
 * `conversation_self_select` carries `archived_at IS NULL`, so a client cannot read an
 * archived thread at all — archiving one from here would make it vanish with no way back, and
 * widening the policy would silently change what §2.2's dashboard and trip-detail queries
 * return. Archiving is the agent's filing tool for hundreds of threads. Departure 9 in the
 * mobile artboard, recorded there first.
 *
 * ON MUI (step 2 of the migration): `.client-fill` stays on the root as the hook
 * web/styles/client.css gives this screen its definite height through; the pane widths are
 * sx breakpoint objects (only `web`, as before — see ClientNav.tsx on why `md:` must never be
 * paired with it here), on a wrapper Box so InboxList keeps its props.
 */
export default async function MessagesInboxPage() {
  const [conversations, me] = await Promise.all([loadInbox(), currentPlatformUser()]);

  // Null is a failed read, which is §5's error state. An empty array is "no conversations
  // yet" and belongs to the list's own empty state — a different thing, and the one place
  // this screen must not confuse.
  if (!conversations) return <RetryState />;

  const rows = inboxRows(conversations, me.timeZone);

  return (
    <Box className="client-fill" sx={{ display: "flex" }}>
      <Box sx={INBOX_PANE_SX}>
        <InboxList rows={rows} />
      </Box>

      <Box
        sx={{
          display: { xs: "none", web: "flex" },
          minHeight: 0,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <EmptyState
          icon="message"
          title={MESSAGES_WEB.selectTitle}
          body={MESSAGES_WEB.selectBody}
        />
      </Box>
    </Box>
  );
}
