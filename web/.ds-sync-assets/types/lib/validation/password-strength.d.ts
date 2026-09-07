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
export declare const PASSWORD_RULE_LABELS: {
    readonly length: "at least 12 characters";
    readonly uppercase: "a capital letter";
    readonly lowercase: "a lowercase letter";
    readonly digit: "a number";
};
export declare const STRENGTH_MESSAGES: {
    readonly strong: "Strong — 12+ characters, upper and lower case, and a number.";
    readonly stillNeedsPrefix: "Still needs ";
};
export declare const PASSWORD_RULES: readonly PasswordRule[];
export interface PasswordStrength {
    /** How many of the four rules are satisfied, 0–4. Drives the bar and its colour. */
    score: number;
    /** Rules not yet met, in the order they are read out. */
    missing: string[];
    /** True when the password would pass `newPasswordSchema`. */
    meets: boolean;
}
export declare function passwordStrength(value: string): PasswordStrength;
/** "a and b" / "a, b and c" — the reader is being helped, not given a bullet list. */
export declare function joinReadably(parts: readonly string[]): string;
/**
 * The line under the bar.
 *
 * Empty for an empty field: someone who has not typed anything yet is not failing at
 * anything, and telling them what they are missing before they start is nagging.
 */
export declare function strengthMessage(value: string): string;
