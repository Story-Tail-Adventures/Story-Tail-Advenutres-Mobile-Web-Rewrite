import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-5 md:px-6 md:py-7">
      <Link href="/messages" className="btn btn-text btn-sm tap-44 -ml-1 mb-1 inline-flex">
        <Icon name="arrow_left" size={14} />
        {MESSAGES.backToMessages}
      </Link>

      <h1 className="t-headline">{MESSAGES.newTitle}</h1>
      <p className="t-body mt-1 mb-4 text-on-surface-variant">{MESSAGES.newSubtitle}</p>

      <NewMessageForm />
    </div>
  );
}
