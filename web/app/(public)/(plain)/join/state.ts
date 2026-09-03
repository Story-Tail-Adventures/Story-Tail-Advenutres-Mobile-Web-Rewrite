import type { MappedAuthError } from "@/lib/auth-errors";
import type { JoinIntent } from "@/lib/public/links";
import type { JoinFieldErrors } from "./schema";

/**
 * Screen 2.0.6 Sign-up Gate — form state and copy. P2.
 *
 * Lives here rather than in actions.ts because a `"use server"` module may only export
 * async functions — every other export is treated as a Server Action and Next.js rejects
 * it at runtime (not at typecheck, which is why it is worth keeping separate).
 *
 * Copy is verbatim from design/source-prototype/screens/client-public.jsx (C206) except
 * the corrections recorded in the builder brief; anything not in the prototype is listed
 * in the package report for the brand-voice reviewer.
 */
export interface JoinState {
  fieldErrors?: JoinFieldErrors;
  formError?: MappedAuthError;
  /**
   * "confirm_email" swaps the form for the check-your-inbox panel. It is returned both
   * after a real sign-up that needs email confirmation AND when the address already has
   * an account — see actions.ts for why those two must be indistinguishable.
   */
  outcome?: "confirm_email";
  /** Echoed back so a failed submit does not clear what they typed. Never the password. */
  firstName?: string;
  lastName?: string;
  email?: string;
}

export const initialJoinState: JoinState = {};

export const JOIN_TEXT = {
  metaTitle: "Create your account",
  metaDescription:
    "Create a Story-Tail account to send Gyasi your trip details, save favorites and see curated proposals.",
  overline: "ALMOST THERE",
  body: "Takes about 60 seconds. You'll get a real proposal back — not a generic search dump.",
  bullets: [
    "Save searches & favorites",
    "View Gyasi's curated proposals",
    "Authorize cards securely · paid to suppliers, not us",
  ],
  google: "Continue with Google",
  apple: "Continue with Apple",
  socialDisabledTitle: "Social sign-in isn't switched on yet — use your email below.",
  divider: "OR EMAIL",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  password: "Password",
  passwordHint: "12+ characters with a number, a capital and a lowercase letter",
  termsBefore: "I agree to the ",
  termsLink: "Terms",
  termsAnd: " & ",
  privacyLink: "Privacy policy",
  pending: "Creating your account…",
  signIn: "Already have an account? Sign in",
  emailInstead: "Email Gyasi instead →",
  confirmTitle: "Check your inbox",
  confirmBefore: "We sent a link to ",
  confirmAfter: ". Open it to finish creating your account.",
} as const;

export interface JoinCopy {
  overline: string;
  title: string;
  body: string;
}

/**
 * Header copy by intent (fidelity spec §5.4). `tripName` is the CATALOG name resolved by
 * the page — never the raw `?trip=` parameter, so nothing a visitor typed into a URL can
 * appear in the headline.
 */
export function joinCopy(intent: JoinIntent | undefined, tripName?: string): JoinCopy {
  const { overline, body } = JOIN_TEXT;
  switch (intent) {
    case "quote":
      return {
        overline,
        title: tripName
          ? `Create an account to send Gyasi your trip details for ${tripName}.`
          : "Create an account to send Gyasi your trip details.",
        body,
      };
    case "save":
      return { overline, title: "Create an account to save this for later.", body };
    case "message":
      return { overline, title: "Almost there — tell Gyasi what you're dreaming about.", body };
    case "tour":
    default:
      return { overline, title: "Create an account to start planning with Gyasi.", body };
  }
}

export function submitLabel(intent: JoinIntent | undefined): string {
  switch (intent) {
    case "quote":
      return "Create account & send my request";
    case "save":
      return "Create account & save";
    default:
      return "Create account";
  }
}
