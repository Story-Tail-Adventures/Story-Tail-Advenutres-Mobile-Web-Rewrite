/**
 * Copy for Screen 2.5.2. Pinned against `PersonalMessages` by check_copy_parity.py.
 *
 * `identityNote` has to explain a read-only field without sounding like a fault. The honest
 * framing is that these two are the account itself rather than a preference — and it points
 * at the person who can change them, which is true today.
 */
export const PERSONAL = {
  title: "Personal info",
  subtitle: "What Gyasi needs to book without chasing you for paperwork.",

  identityHeading: "YOUR ACCOUNT",
  nameLabel: "Name",
  emailLabel: "Email",
  notSet: "Not set",
  identityNote:
    "Changing your name or the address you sign in with isn’t something you can do here yet — message Gyasi and he’ll sort it.",

  save: "Save",
  cancel: "Cancel",
} as const;
