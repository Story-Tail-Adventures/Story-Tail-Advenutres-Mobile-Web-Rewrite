import type { MappedAuthError } from "../../lib/auth-errors";
/**
 * A form-level auth failure, with the "somewhere useful to go" link that most of them
 * carry (`MappedAuthError.action` — e.g. a failed sign-in offers the reset flow).
 *
 * Alert already sets `role="alert" aria-live="polite"`, so a failed submit is announced
 * without stealing focus from whatever the person was typing.
 */
export declare function FormError({ error, className, }: {
    error?: MappedAuthError;
    className?: string;
}): import("react").JSX.Element | null;
