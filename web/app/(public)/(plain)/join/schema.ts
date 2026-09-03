import { z } from "zod";
import { emailSchema, newPasswordSchema } from "@/lib/validation/auth";

/**
 * Screen 2.0.6 Sign-up Gate — form schema. P2.
 *
 * Email and password rules are the shared ones in web/lib/validation/auth.ts (their test
 * vectors are mirrored on mobile — never fork them here). The name and terms rules are
 * web-only until 2.1.2 Registration is built on mobile; when it is, these messages need
 * Kotlin twins in AuthValidation.kt.
 */

/** User-facing copy. Web-only until the Kotlin twin mirrors it. */
export const JOIN_MESSAGES = {
  nameRequired: "Tell us your name",
  nameTooLong: "Use 80 characters or fewer",
  nameInvalid: "Some of those characters won't work here",
  termsRequired: "Please agree to the terms to continue",
} as const;

export const NAME_MAX = 80;

/** Rejects C0/C1 control characters (newlines, NUL, escape) anywhere in a name. */
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;

const nameSchema = z
  .string()
  .trim()
  .min(1, JOIN_MESSAGES.nameRequired)
  .max(NAME_MAX, JOIN_MESSAGES.nameTooLong)
  .regex(NO_CONTROL_CHARS, JOIN_MESSAGES.nameInvalid);

export const joinSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
  // A checked <input type="checkbox" name="terms"> posts the literal "on"; unchecked
  // posts nothing. Screen Inventory 2.1.2 makes acceptance a required checkbox, and the
  // action is reachable without the form, so the rule lives here, not only in the markup.
  terms: z.literal("on", { error: JOIN_MESSAGES.termsRequired }),
});

export type JoinInput = z.infer<typeof joinSchema>;
export type JoinField = keyof JoinInput;
export type JoinFieldErrors = Partial<Record<JoinField, string[]>>;

export const JOIN_FIELDS: readonly JoinField[] = [
  "firstName",
  "lastName",
  "email",
  "password",
  "terms",
];

function isJoinField(key: PropertyKey): key is JoinField {
  return typeof key === "string" && (JOIN_FIELDS as readonly string[]).includes(key);
}

/** zod v4 renamed `.flatten()`; keep the shape the action returns stable. */
export function flattenJoinIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): JoinFieldErrors {
  const fieldErrors: JoinFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key !== undefined && isJoinField(key)) {
      (fieldErrors[key] ??= []).push(issue.message);
    }
  }
  return fieldErrors;
}
