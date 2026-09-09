import type {
  LoyaltyRow,
  PreferencesField,
} from "@/lib/validation/preferences";

/**
 * Screen 2.1.11 Travel Preferences — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async functions.
 *
 * Copy follows design/source-prototype/screens/client-auth.jsx (`C2111_PreferencesCapture`)
 * and client-auth-mobile.jsx (`M2111_PreferencesCapture`), with the departures noted on the
 * strings that changed.
 */

/** Every control on the screen, as the strings a form posts. Also the prefill shape. */
export interface PreferencesFormValues {
  destinations: string[];
  destinationOther: string;
  travelStyles: string[];
  dietary: string[];
  dietaryNotes: string;
  accessibility: string[];
  accessibilityNotes: string;
  loyalty: LoyaltyRow[];
  budgetBand: string;
  favoritePastTrips: string;
}

export interface PreferencesState {
  fieldErrors?: Partial<Record<PreferencesField, string[]>>;
  formError?: string;
  /** Echoed back so a failed submit does not lose a screen's worth of answers. */
  values?: PreferencesFormValues;
}

export const initialPreferencesState: PreferencesState = {};

export const PREFERENCES_TEXT = {
  metaTitle: "How do you travel?",
  metaDescription:
    "Tell Gyasi how you like to travel — destinations, style, food, access, and where your " +
    "budget sits — so planning starts closer to the mark.",
  title: "How do you travel?",
  // The prototype says "Tag what's true. The more, the better. Anything missing? Tell Gyasi
  // later." "The more, the better" turns an optional screen into a completeness score,
  // which is the pushy-CTA failure Design-System §2.6 check 3 exists to catch — and it
  // quietly argues with the "Skip for now" sitting right below it. "Tag what's true" is
  // exactly right and is kept.
  sub: "Tag what's true. Nothing here is required — it just means I start closer to the mark.",

  primaryCta: "Save & continue",
  pending: "Saving your preferences…",
  secondaryCta: "Skip for now",
  secondaryCtaA11y: "Skip for now — you can add this later",
  secondaryPending: "Taking you to the next step…",

  // Both artboards disagree about these headings ("Style" vs "Travel style", "Diet" vs
  // "Accessibility needs"), so something had to be chosen. "Diet" is curt; the Inventory's
  // own "dietary restrictions" frames an answer as a limitation. "Dietary needs" is the
  // same information without the flinch.
  sectionDestinations: "Destinations",
  hintDestinations: "Places you keep coming back to, or keep meaning to see.",
  labelDestinationOther: "Somewhere else?",
  placeholderDestinationOther: "Add a place — or a few, separated by commas",

  sectionStyle: "Travel style",
  hintStyle: "Pick everything that sounds like a trip you'd take.",

  sectionDiet: "Dietary needs",
  labelDietNotes: "Anything else about food?",
  placeholderDietNotes: "Allergies, or anything a kitchen should know",

  sectionAccess: "Access needs",
  labelAccessNotes: "Anything else we should arrange?",
  placeholderAccessNotes:
    "A room by the lift, an outlet by the bed — whatever helps",

  sectionLoyalty: "Loyalty programs",
  hintLoyalty: "So your miles and points actually get credited.",
  labelLoyaltyProgram: "Program",
  placeholderLoyaltyProgram: "e.g. AAdvantage",
  labelLoyaltyNumber: "Member number",
  loyaltyAdd: "Add another",
  loyaltyRemove: "Remove",

  sectionBudget: "Budget comfort range",
  hintBudget:
    "Roughly, per person. It just tells me where to start looking — nothing here is a " +
    "commitment.",

  labelFavorites: "A trip you still talk about",
  placeholderFavorites: "Where were you, and what made it stick?",

  // Same reasoning as 2.1.10: the spec's copy ended with a "message Gyasi" link, and
  // in-app messaging is Screen 2.6, which is not built. A link to a screen that does not
  // exist is worse than no link.
  formError:
    "That didn't save — nothing's lost, your answers are still here. Try again, or skip " +
    "for now and we'll pick this up later.",
} as const;
