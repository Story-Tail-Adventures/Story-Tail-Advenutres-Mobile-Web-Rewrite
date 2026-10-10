import Link from "@mui/material/Link";

import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import type { MappedAuthError } from "@/lib/auth-errors";

/**
 * A form-level auth failure, with the "somewhere useful to go" link that most of them
 * carry (`MappedAuthError.action` — e.g. a failed sign-in offers the reset flow).
 *
 * Alert already sets `role="alert" aria-live="polite"`, so a failed submit is announced
 * without stealing focus from whatever the person was typing.
 *
 * The link is MUI's Link over next/link, inheriting the alert's colour so it reads as part
 * of the sentence, underlined and semibold the way the legacy one was.
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
            component={NextLink}
            href={error.action.href}
            color="inherit"
            underline="always"
            sx={{ fontWeight: 600, textUnderlineOffset: 2 }}
          >
            {error.action.label}
          </Link>
          .
        </>
      )}
    </Alert>
  );
}
