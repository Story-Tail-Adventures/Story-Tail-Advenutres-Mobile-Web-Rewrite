import { z } from "zod";

/**
 * The rules every free-text field shares.
 *
 * Pulled out when Screen 2.1.10 needed the same control-character rule that
 * `registration.ts` had been carrying alone. A second copy of this regex is exactly how
 * two screens end up disagreeing about what a name may contain.
 */

/**
 * Rejects C0/C1 control characters — NUL, escape, and the newlines that turn a single-line
 * value into two lines somewhere it is later rendered or emailed.
 */
export const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;

/**
 * A trimmed, optional single-line field: `""` becomes `null`.
 *
 * Null rather than empty string because that is what the columns want. `address.line2` is
 * nullable and `''` is not the same as "no apartment number" — one of them sorts, indexes
 * and displays as a value.
 */
export function optionalTextSchema(
  max: number,
  messages: { tooLong: string; invalid: string },
) {
  return z
    .string()
    .trim()
    .max(max, messages.tooLong)
    .regex(NO_CONTROL_CHARS, messages.invalid)
    .transform((value) => (value === "" ? null : value));
}
