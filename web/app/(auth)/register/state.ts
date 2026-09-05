import type { MappedAuthError } from "@/lib/auth-errors";
import type { RegistrationWithConfirmField } from "@/lib/validation/registration";

/**
 * Screen 2.1.2 Registration — form state and copy.
 *
 * Separate from actions.ts because a `"use server"` module may only export async
 * functions; every other export is treated as a Server Action and rejected at runtime.
 *
 * Copy is from design/source-prototype/screens/client-auth.jsx (C212) except where noted.
 */
export interface RegisterState {
  fieldErrors?: Partial<Record<RegistrationWithConfirmField, string[]>>;
  formError?: MappedAuthError;
  /**
   * Swaps the form for the check-your-inbox panel. Returned both after a real sign-up
   * awaiting confirmation AND when the address already has an account — see actions.ts
   * for why those two must be indistinguishable.
   */
  outcome?: "confirm_email";
  /** Echoed back so a failed submit does not clear the form. Never either password. */
  firstName?: string;
  lastName?: string;
  email?: string;
}

export const initialRegisterState: RegisterState = {};

export const REGISTER_TEXT = {
  metaTitle: "Create your account",
  metaDescription:
    "Create a Story-Tail account to see the trips Gyasi is planning for you, authorize " +
    "cards securely, and message him any time.",
  overline: "JOIN STORY-TAIL",
  title: "Create your account",
  sub: "Takes about 60 seconds. No planning fees, ever.",
  google: "Sign up with Google",
  apple: "Sign up with Apple",
  socialDisabledTitle: "Social sign-up isn't switched on yet — use your email below.",
  divider: "OR EMAIL",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  password: "Password",
  passwordHint: "12+ characters with a number, a capital and a lowercase letter",
  confirm: "Confirm password",
  termsBefore: "I agree to the ",
  termsLink: "Terms",
  termsAnd: " & ",
  privacyLink: "Privacy policy",
  submit: "Create account",
  pending: "Creating your account…",
  haveAccount: "Already a member?",
  signIn: "Sign in",
  confirmTitle: "Check your email",
  confirmBefore: "We sent a verification link to ",
  confirmAfter: ".",
  // From C213's "Why verify?" card, which lands on the same moment: the reason to open
  // the email is that it connects the trips Gyasi has already been planning.
  whyTitle: "Why verify?",
  whyBody:
    "It links any trips Gyasi has already started planning for you, so you'll see them " +
    "as soon as you sign in.",
  verifyCta: "Didn't get it?",
} as const;
