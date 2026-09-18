/**
 * Web-only chrome for §2.6.
 *
 * The section's real copy is in `web/lib/messages/content.ts`, which is shared with the
 * Kotlin twin. What is here has no mobile counterpart at all: it belongs to the two-pane
 * master-detail layout, and mobile has no second pane to prompt about. §2.2.7 splits its copy
 * the same way, for the same reason.
 */
export const MESSAGES_WEB = {
  /**
   * The right pane before a thread is picked, shown only at `web:` (≥1200px) — below that the
   * list is the whole screen and this never renders.
   */
  selectTitle: "Pick a conversation",
  selectBody: "Choose a thread on the left, or start a new one.",
} as const;
