/**
 * Copy for Screen 2.5.1 Account Overview.
 *
 * PINNED against its Kotlin twin `AccountMessages` in
 * `mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/account/AccountCopy.kt`
 * by `.github/scripts/check_copy_parity.py`. Change a string here and the same change is
 * required there, or CI fails.
 *
 * This note used to say the opposite — that the row was deliberately absent until a Compose
 * implementation existed. It did, and then the Compose implementation landed and the note
 * did not. A comment claiming parity is NOT enforced is worse than no comment: it invites
 * the exact one-sided edit the script exists to catch.
 *
 * Subtitles say what is INSIDE, in data — "Name, email, phone, address", "4 files · 1
 * expiring soon" — rather than describing the screen ("Manage your notification
 * preferences"). Design-System §2.6's tone check: a friend who has done this a hundred
 * times tells you what is in the drawer, not what the drawer is for.
 */
export const ACCOUNT = {
  title: "Account",
  memberSince: (month: string) => `Traveling with Gyasi since ${month}`,

  /** Shown when the name read failed or the columns are still at their placeholders. */
  fallbackName: "Your account",

  groupYou: "YOU",
  groupApp: "APP",
  groupSupport: "SUPPORT",

  personal: "Personal info",
  personalSub: "Name, email, phone, address",

  preferences: "Travel preferences",
  preferencesSub: "Style, dietary, loyalty",

  documents: "Travel documents",
  /**
   * A count that the destination screen must agree with — 2.5.4 renders the same list.
   *
   * NO "expiring soon" half. The Screen Inventory note at 2.5.1 describes one, and 2.5.4
   * lists "expiration warnings" as a primary element, but neither is computed anywhere yet:
   * it needs `travel_document.expires_on` compared against a window, and this hub reads
   * `document`, which has no expiry at all. A hardcoded zero dressed as a real count is the
   * kind of claim this section spent its doc pass removing. It returns with the warning.
   */
  documentsSub: (files: number) => `${files} ${files === 1 ? "file" : "files"}`,
  documentsEmptySub: "Passports, visas, insurance",

  notifications: "Notifications",
  security: "Security",
  securitySub: "Password and two-factor",

  connected: "Connected accounts",
  connectedSub: "Google and Apple sign-in",

  help: "Help & support",
  helpSub: "Common questions, or message Gyasi",

  privacy: "Privacy & data",
  privacySub: "Download a copy of your data",

  /** §2.4 is unbuilt. Same wording the nav rail uses for its own dead destinations. */
  wallet: "Payment methods",
  comingSoon: "Coming with the next release",

  signOut: "Sign out",
} as const;
