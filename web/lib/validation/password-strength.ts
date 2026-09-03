/**
 * The password policy, expressed as something a meter can render.
 *
 * Screen Inventory 2.1.2 and 2.1.5 both call for a strength meter. The rules are exactly
 * `newPasswordSchema` in ./auth.ts — not a separate heuristic. A meter that says "strong"
 * about a password the server will reject is worse than no meter at all, so the two are
 * kept in one file's worth of reading distance and asserted against each other in
 * ./password-strength.test.ts.
 *
 * There is deliberately no entropy estimate or dictionary check here. GoTrue applies
 * `password_requirements` (supabase/config.toml) and its own weak-password check; guessing
 * at a second opinion in the browser would only teach people to trust a number that has no
 * authority over whether their sign-up succeeds.
 */

export interface PasswordRule {
  /** Named so the meter can list what is still missing, in the reader's words. */
  label: string;
  met: (value: string) => boolean;
}

/**
 * Split out from the rules themselves so the Kotlin twin can be compared against it —
 * .github/scripts/check_copy_parity.py reads flat string constants, not the labels of
 * objects in an array. The predicates have no twin to drift from; the words do.
 */
export const PASSWORD_RULE_LABELS = {
  length: "at least 12 characters",
  uppercase: "a capital letter",
  lowercase: "a lowercase letter",
  digit: "a number",
} as const;

export const STRENGTH_MESSAGES = {
  strong: "Strong — 12+ characters, upper and lower case, and a number.",
  stillNeedsPrefix: "Still needs ",
} as const;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { label: PASSWORD_RULE_LABELS.length, met: (v) => v.length >= 12 },
  { label: PASSWORD_RULE_LABELS.uppercase, met: (v) => /[A-Z]/.test(v) },
  { label: PASSWORD_RULE_LABELS.lowercase, met: (v) => /[a-z]/.test(v) },
  { label: PASSWORD_RULE_LABELS.digit, met: (v) => /\d/.test(v) },
];

export interface PasswordStrength {
  /** How many of the four rules are satisfied, 0–4. Drives the bar and its colour. */
  score: number;
  /** Rules not yet met, in the order they are read out. */
  missing: string[];
  /** True when the password would pass `newPasswordSchema`. */
  meets: boolean;
}

export function passwordStrength(value: string): PasswordStrength {
  const missing = PASSWORD_RULES.filter((rule) => !rule.met(value)).map((r) => r.label);
  return {
    score: PASSWORD_RULES.length - missing.length,
    missing,
    meets: missing.length === 0,
  };
}

/** "a and b" / "a, b and c" — the reader is being helped, not given a bullet list. */
export function joinReadably(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The line under the bar.
 *
 * Empty for an empty field: someone who has not typed anything yet is not failing at
 * anything, and telling them what they are missing before they start is nagging.
 */
export function strengthMessage(value: string): string {
  if (value.length === 0) return "";
  const { meets, missing } = passwordStrength(value);
  return meets
    ? STRENGTH_MESSAGES.strong
    : `${STRENGTH_MESSAGES.stillNeedsPrefix}${joinReadably(missing)}.`;
}
