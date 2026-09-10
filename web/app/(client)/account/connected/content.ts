/**
 * Copy for Screen 2.5.8 Connected Accounts. Pinned against `ConnectedMessages` by check_copy_parity.py.
 *
 * `safetyNote` is doing real work: it answers the question a disabled Unlink button provokes
 * ("so am I stuck?") and it states the thing that is actually true — unlinking never deletes
 * anything. Do not soften it into "manage your sign-in options".
 */
export const CONNECTED = {
  title: "Connected accounts",
  subtitle: "How you sign in.",

  linked: "Connected",
  notLinked: "Not connected",

  linkCta: "Link",
  unlinkCta: "Unlink",

  linkDeferred: "Coming with the next release",
  unlinkDeferred: "Coming with the next release",

  emailAccountNote:
    "You sign in with an email address and password. Linking Google or Apple would let you skip the password — that is coming.",
  oauthAccountNote:
    "You sign in through the provider above, so there is no password on this account. Changing it is done in that account, not here.",

  safetyNote:
    "Unlinking never deletes anything. Your trips, documents and messages stay exactly where they are.",
} as const;
