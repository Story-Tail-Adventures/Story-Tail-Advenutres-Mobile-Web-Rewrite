/**
 * Screen 2.1.12 Travel Companions — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async functions.
 *
 * Copy follows design/source-prototype/screens/client-auth.jsx (`C2112_Companions`) and
 * client-auth-mobile.jsx (`M2112_Companions`), with the departures noted on the strings
 * that changed.
 */

/** A companion as the list renders it. Never carries a passport number — see actions.ts. */
export interface CompanionRow {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  passportExpiry: string;
  passportCountry: string;
}

export type CompanionField =
  | "firstName"
  | "lastName"
  | "relationship"
  | "dateOfBirth"
  | "passportExpiry"
  | "passportCountry";

export interface CompanionsState {
  fieldErrors?: Partial<Record<CompanionField, string[]>>;
  formError?: string;
  /** Echoed back so a rejected submit does not empty the form. */
  values?: Omit<CompanionRow, "id">;
  /** The row being edited when the submit failed, so the form stays in edit mode. */
  editingId?: string;
  /**
   * Set only when a save actually landed, and different on every one.
   *
   * The form closes on this and on nothing else. Closing it optimistically on submit —
   * which is what this replaced — threw away everything somebody had typed the moment a
   * name failed validation, which is the worst thing a form can do.
   */
  savedToken?: number;
}

export const initialCompanionsState: CompanionsState = {};

/** How many the Edge Function will hold. Kept in step with MAX_COMPANIONS there. */
export const MAX_COMPANIONS = 12;

export const COMPANIONS_TEXT = {
  metaTitle: "Who often travels with you?",
  metaDescription:
    "Name the people you usually travel with, so Gyasi has their traveler details ready " +
    "instead of asking again on every booking.",
  title: "Who often travels with you?",
  // First person, like every other on-page line in the wizard: 2.1.10 and 2.1.11 both
  // speak as Gyasi here, and "we" reads as the system describing him from outside.
  sub: "So I can pre-fill their info next time you book together. Add now, or skip — totally up to you.",

  primaryCta: "Save & continue",
  pending: "Saving…",
  secondaryCta: "Skip for now",
  secondaryCtaA11y: "Skip for now — you can add travelers later",
  secondaryPending: "Taking you to the next step…",

  listAriaLabel: "Your travel companions",
  addCta: "Add a traveler",
  emptyTitle: "No one added yet",
  emptyBody:
    "Add the people you usually travel with and I'll have their details ready when you " +
    "book together. There's no rush — you can come back to this any time.",
  emptyCta: "Add your first traveler",

  editAction: "Edit",
  editAriaLabel: (name: string) => `Edit ${name}`,
  removeAction: "Remove",
  removeAriaLabel: (name: string) => `Remove ${name} from your travelers`,
  removePending: "Removing…",

  // The prototype prints "Passport B987654321 · 02/2031" in the card subtitle. That cannot
  // ship: the number is outside the client's SELECT grant, showing it would need a
  // decryption, and Data-Model §18.3 requires an audit_event for every decryption — which
  // makes rendering one per companion on every page load plainly wrong. It is also moot,
  // because no number is collected. What remains is the expiry, which is the useful part.
  passportExpires: (when: string) => `Passport expires ${when}`,
  passportNone: "No passport details yet",
  passportExpiringSoon: (when: string) =>
    `Passport expires ${when} — many countries want six months' validity`,
  born: (when: string) => `Born ${when}`,

  formAddTitle: "Add a traveler",
  formEditTitle: (name: string) => `Edit ${name}`,
  formSub:
    "Just the basics. Passport details are optional — add them whenever you have the book " +
    "in hand.",
  labelFirstName: "First name",
  labelLastName: "Last name",
  labelRelationship: "Relationship",
  labelDateOfBirth: "Date of birth",
  labelPassportExpiry: "Expires",
  labelPassportCountry: "Country of issue",
  countryPlaceholder: "Pick a country",
  relationshipSuggestions: [
    "Spouse",
    "Partner",
    "Child",
    "Parent",
    "Sibling",
    "Friend",
  ] as readonly string[],
  formSave: "Save traveler",
  formSaving: "Saving…",
  formCancel: "Cancel",

  errorLoad:
    "We couldn't load your travelers just now — anyone you've already added is still " +
    "there. Reload in a moment, or carry on and come back to this.",
  unfinishedForm:
    "Save or cancel the traveler you're adding, and we'll move on.",
  errorSave: "That didn't save. Give it another go — nothing was lost.",
  errorRemove: "We couldn't remove them just now. Try again in a moment.",
  errorMax:
    "That's twelve travelers — plenty for one household. Need more? I can add them when " +
    "we're planning together.",
} as const;
