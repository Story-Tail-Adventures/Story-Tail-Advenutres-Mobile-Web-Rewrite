/**
 * Copy for Screen 2.5.1 Account Overview.
 *
 * NOT registered in `.github/scripts/check_copy_parity.py`, deliberately. That script
 * compares a web module against its Kotlin twin, and §2.5 has no Compose implementation yet
 * — registering a row now would fail CI against a file that does not exist. **Add the row in
 * the same change that builds `AccountScreen.kt`**, or the parity gap is silent, which is
 * exactly what that script's header warns about.
 *
 * Subtitles say what is INSIDE, in data — "Name, email, phone, address", "4 files · 1
 * expiring soon" — rather than describing the screen ("Manage your notification
 * preferences"). Design-System §2.6's tone check: a friend who has done this a hundred
 * times tells you what is in the drawer, not what the drawer is for.
 */
export const ACCOUNT = {
  title: "Account",
  memberSince: (month: string) => `Traveling with Gyasi since ${month}`,

  groupYou: "YOU",
  groupApp: "APP",
  groupSupport: "SUPPORT",

  personal: "Personal info",
  personalSub: "Name, email, phone, address",

  preferences: "Travel preferences",
  preferencesSub: "Style, dietary, loyalty",

  documents: "Travel documents",
  /** A count that the destination screen must agree with — 2.5.4 renders the same list. */
  documentsSub: (files: number, expiring: number) =>
    expiring > 0
      ? `${files} ${files === 1 ? "file" : "files"} · ${expiring} expiring soon`
      : `${files} ${files === 1 ? "file" : "files"}`,
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
