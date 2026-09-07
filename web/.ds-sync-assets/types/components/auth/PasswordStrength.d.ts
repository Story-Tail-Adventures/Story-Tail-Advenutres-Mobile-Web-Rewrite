import { type FieldProps } from "../ui/Field";
/**
 * A password field with the strength meter from the prototype (design: C212 and C215 — a
 * 4px track under the input with a coloured fill, and a line of text under that).
 *
 * **The password itself never enters React state.** Only the derived score and message do.
 * That is the reason this reads `event.target.value` and throws the value away rather than
 * being a controlled input: a controlled password would sit in component state, in every
 * re-render's props, and in whatever a devtools snapshot or an error boundary happens to
 * capture. The input stays uncontrolled and the server action reads it out of FormData,
 * exactly as on 2.1.1.
 *
 * The track is `aria-hidden` — it carries no information the hint text does not already
 * say, and the hint is already wired into the field's `aria-describedby`.
 */
export interface PasswordStrengthFieldProps extends Omit<FieldProps, "hint" | "meter"> {
    /** Shown before anything is typed: the policy, stated once, without nagging. */
    idleHint: string;
}
export declare function PasswordStrengthField({ idleHint, onChange, ...props }: PasswordStrengthFieldProps): import("react").JSX.Element;
