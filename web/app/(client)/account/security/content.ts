/**
 * Copy for Screen 2.5.7 Security. Not in MESSAGE_TABLES until a Kotlin twin exists.
 *
 * `sessionsDeferred` says what is true rather than "coming soon": the reader's real question
 * on a security screen is "can someone else be signed in as me?", and the honest answer is
 * that we cannot show them yet — followed by the thing they CAN do about it. That is §2.2.8's
 * lesson, where a carrier narration asserted something no column held.
 *
 * No vendor is named for the authenticator and no backup codes are offered; see the page
 * header for why both would be undeliverable.
 */
export const SECURITY = {
  title: "Security",
  subtitle: "How you get in, and how we keep others out.",

  passwordTitle: "Password",
  passwordBody: "Change it whenever you like — you’ll get a link by email.",
  passwordCta: "Change password",
  /** /forgot-password bounces a signed-in visitor; see the page comment. */
  passwordDeferred: "Coming with the next release — for now, sign out and use “Forgot?” on the sign-in screen.",

  noPasswordTitle: "How you sign in",
  noPasswordBody: (provider: string) =>
    `You sign in with ${provider === "google" ? "Google" : provider === "apple" ? "Apple" : provider}, so there is no password here to change. Manage it in that account.`,
  noPasswordCta: "Connected accounts",

  mfaTitle: "Two-factor authentication",
  mfaOn: "On",
  mfaOff: "Off",
  mfaBody: "A six-digit code from your authenticator app, on top of your password.",
  mfaEnableCta: "Turn on two-factor",
  mfaManageCta: "Replace your authenticator",
  /** 2.1.6 redirects anyone already enrolled; managing a factor is this screen's own job. */
  mfaManageDeferred: "Coming with the next release. Two-factor is on and working in the meantime.",

  sessionsHeading: "WHERE YOU ARE SIGNED IN",
  sessionsDeferred:
    "We can’t show you your other devices yet. It needs a piece we haven’t built, and a list that is always empty would tell you the wrong thing.",
  sessionsAdvice:
    "If you think someone else has your account: change your password, turn on two-factor, and tell Gyasi. He would rather hear about it early.",
} as const;
