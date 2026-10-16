/** §3.10 Stage 4's opt-out page. Web only: the phone app has no page for an email link. */
export const UNSUBSCRIBE_COPY = {
  metaTitle: "Message emails",
  onTitle: "Stop emailing you about messages?",
  onBody:
    "Every message from your advisor will still be waiting in the app, and you'll still get notifications there. This only stops the emails.",
  stop: "Stop these emails",
  offTitle: "Done. No more message emails.",
  offBody: "Your conversation is still in the app whenever you want it. Changed your mind?",
  turnBackOn: "Turn them back on",
  backOnTitle: "You're all set. Message emails are back on.",
  invalidTitle: "This link has expired",
  invalidBody: "Sign in to see your messages. You can reply there any time.",
  signIn: "Sign in",
  unavailableTitle: "We couldn't reach your settings just now",
  unavailableBody: "Please try the link again in a moment.",
} as const;
