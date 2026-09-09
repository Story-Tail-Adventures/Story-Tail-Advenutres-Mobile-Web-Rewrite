import { z } from "zod";
import {
  NAME_MAX,
  REGISTRATION_FIELDS,
  REGISTRATION_MESSAGES,
  registrationSchema,
  type RegistrationField,
} from "@/lib/validation/registration";
import { flattenIssues } from "@/lib/validation/flatten";

/**
 * Screen 2.0.6 Sign-up Gate — form schema. P2.
 *
 * The rules themselves moved to web/lib/validation/registration.ts when Screen 2.1.2
 * Registration was built, because the two screens create the same account and had already
 * started to diverge. This module is the gate's view of them; the names are kept so the
 * gate's own tests keep testing the gate.
 */

export { NAME_MAX };

/** User-facing copy. Web-only until the Kotlin twin mirrors it. */
export const JOIN_MESSAGES = REGISTRATION_MESSAGES;

/** The gate has no password-confirmation field — 2.1.2 does. */
export const joinSchema = registrationSchema;

export type JoinInput = z.infer<typeof registrationSchema>;
export type JoinField = RegistrationField;
export type JoinFieldErrors = Partial<Record<JoinField, string[]>>;

export const JOIN_FIELDS: readonly JoinField[] = REGISTRATION_FIELDS;

/** zod v4 renamed `.flatten()`; keep the shape the action returns stable. */
export function flattenJoinIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): JoinFieldErrors {
  return flattenIssues(error, JOIN_FIELDS);
}
