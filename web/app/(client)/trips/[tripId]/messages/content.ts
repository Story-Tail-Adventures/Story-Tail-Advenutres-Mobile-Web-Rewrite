/**
 * Screen 2.2.7 copy.
 *
 * The compose placeholder, the quick replies, the day separators and the empty state live in
 * `web/lib/trips/thread.ts` — native renders those too and CI compares them. What is here is
 * web-only chrome.
 */
export const THREAD = {
  back: "Back to trip",
  title: "Messages",
  /**
   * The artboard's header read "Gyasi · Sandals · Aug 12" on one line with "Trip thread ·
   * last reply 2h ago" beneath. "Last reply 2h ago" is dropped: it is derivable from
   * `conversation.last_message_at`, but it decays — a page cached for an hour tells the
   * traveler a confident lie about how recently their advisor spoke. The timestamp on the
   * last bubble says the same thing and cannot go stale, because it is absolute.
   */
  advisorName: "Gyasi",
  unreadLabel: (count: number) => (count === 1 ? "1 new message" : `${count} new messages`),
  openTrip: "Open trip",
  attachDeferred: "Attaching from the web arrives with the upload screen",
} as const;
