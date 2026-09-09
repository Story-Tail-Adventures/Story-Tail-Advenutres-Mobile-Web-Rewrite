import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import type { MappedAuthError } from "@/lib/auth-errors";

/**
 * A form-level auth failure, with the "somewhere useful to go" link that most of them
 * carry (`MappedAuthError.action` — e.g. a failed sign-in offers the reset flow).
 *
 * Alert already sets `role="alert" aria-live="polite"`, so a failed submit is announced
 * without stealing focus from whatever the person was typing.
 */
export function FormError({
  error,
  className,
}: {
  error?: MappedAuthError;
  className?: string;
}) {
  if (!error) return null;
  return (
    <Alert tone="error" className={className}>
      {error.message}
      {error.action && (
        <>
          {" "}
          <Link
            href={error.action.href}
            className="font-semibold underline underline-offset-2"
          >
            {error.action.label}
          </Link>
          .
        </>
      )}
    </Alert>
  );
}
