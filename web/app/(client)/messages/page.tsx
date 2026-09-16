import type { Metadata } from "next";

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
 */
export default async function MessagesInboxPage() {
  const [conversations, me] = await Promise.all([loadInbox(), currentPlatformUser()]);

  // Null is a failed read, which is §5's error state. An empty array is "no conversations
  // yet" and belongs to the list's own empty state — a different thing, and the one place
  // this screen must not confuse.
  if (!conversations) return <RetryState />;

  const rows = inboxRows(conversations, me.timeZone);

  return (
    <div className="client-fill flex">
      <InboxList
        rows={rows}
        // Only `web:` here — pairing `md:` with `web:` on one property loses the `web:` value,
        // because `web:` is px-based and `md:` is rem-based so Tailwind emits `web:` first.
        // ClientNav.tsx documents this at length.
        className="w-full web:w-[340px] web:shrink-0 web:border-r web:border-outline-variant"
      />

      <div className="hidden min-h-0 flex-1 items-center justify-center p-6 web:flex">
        <EmptyState
          icon="message"
          title={MESSAGES_WEB.selectTitle}
          body={MESSAGES_WEB.selectBody}
        />
      </div>
    </div>
  );
}
