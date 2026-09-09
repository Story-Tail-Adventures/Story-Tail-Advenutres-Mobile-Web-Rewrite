import type { ProfileField } from "@/lib/validation/profile";

/**
 * Screen 2.1.10 Profile Completion — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async functions;
 * every other export is treated as a Server Action and rejected at runtime.
 *
 * Copy follows design/source-prototype/screens/client-auth.jsx (`C2110_ProfileCompletion`)
 * and client-auth-mobile.jsx (`M2110_ProfileCompletion`) except where the prototype cannot
 * be built as drawn — see the deviations noted on each string.
 */

/** Every input on the screen, as the strings a form posts. Also the prefill shape. */
export interface ProfileFormValues {
  phone: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  passportExpiry: string;
  passportCountry: string;
}

export interface ProfileState {
  /** Keyed by input name, plus the three group names — see `PROFILE_FIELDS`. */
  fieldErrors?: Partial<Record<ProfileField, string[]>>;
  formError?: string;
  /** Echoed back so a failed submit does not empty the form the person just filled in. */
  values?: ProfileFormValues;
}

export const initialProfileState: ProfileState = {};

export const PROFILE_TEXT = {
  metaTitle: "A few quick details",
  metaDescription:
    "Add your contact details, emergency contact and passport info so Gyasi can plan and " +
    "book without chasing you for paperwork.",
  title: "A few quick details",
  sub: "So I can plan with all the right info on hand. You can edit any of this later.",
  optionalNote: "Nothing here is required — fill in what you know and skip the rest.",

  primaryCta: "Save & continue",
  pending: "Saving…",
  secondaryCta: "Skip for now",
  // Contains the visible label verbatim: WCAG 2.5.3 (Label in Name) is about a
  // voice-control user being able to say what they can see.
  secondaryCtaA11y: "Skip for now — these details can wait",
  secondaryPending: "Taking you to the next step…",

  labelPhone: "Phone",
  hintPhone: "So I can reach you if a flight moves. US numbers unless you add a country code.",
  labelDob: "Date of birth",
  hintDob: "Airlines and resorts ask for this at booking — having it saves us an email later.",

  groupAddress: "Mailing address",
  labelAddressLine1: "Street address",
  labelAddressLine2: "Apt, suite, etc.",
  labelAddressCity: "City",
  /** "State" and "ZIP code" are American; the labels follow the country that is chosen. */
  labelAddressRegionUs: "State",
  labelAddressRegion: "Region",
  labelAddressPostalUs: "ZIP code",
  labelAddressPostal: "Postal code",
  labelAddressCountry: "Country",
  countryPlaceholder: "Pick a country",

  groupEmergency: "Emergency contact",
  hintEmergency:
    "One person we'd call if something happened while you're away. It goes on your " +
    "itinerary and nowhere else.",
  labelEmergencyName: "Name",
  labelEmergencyPhone: "Phone",
  // MISSING FROM THE PROTOTYPE, which crams it into the name field as "Sam Hayes (spouse)".
  // Both Screen-Inventory §2.1.10 and Data-Model §6.1 name relationship as its own value,
  // and a parenthetical stored as part of somebody's name is a parenthetical forever.
  labelEmergencyRelationship: "Relationship",
  relationshipSuggestions: [
    "Spouse",
    "Partner",
    "Parent",
    "Child",
    "Sibling",
    "Friend",
  ] as readonly string[],

  groupPassport: "Passport",
  groupPassportOptional:
    "Optional, but worth adding if there's any chance of international travel",
  // The prototype's passport NUMBER field is not built. Data-Model §18.2 requires
  // column-level encryption under a backend-held key for `document_number_encrypted`, and
  // nothing implements that yet; collecting a passport number to store it unprotected
  // would be worse than not collecting it. The expiry is what drives the renewal reminder,
  // which is the part travelers actually feel. Decision recorded September 2026.
  hintPassport:
    "I use the expiry date to warn you long before it's a problem. The number itself " +
    "isn't collected here yet.",
  labelPassportExpiry: "Expires",
  labelPassportCountry: "Country of issue",
  passportExpiredWarning:
    "That passport has expired. It's saved either way — worth starting the renewal before " +
    "we book anything international.",

  // The spec's suggested copy ends "message Gyasi and he'll sort it out" with a link.
  // There is nowhere to link: in-app messaging is Screen 2.7, which is not built, and a
  // "Message Gyasi" button that 404s is worse than none. The skip below is a real exit, so
  // the copy points at that instead.
  formError:
    "That didn't save — nothing's lost. Give it another try, or skip for now and we'll " +
    "pick this up later.",
} as const;
