import * as React from "react";

/**
 * The shared shell for the 2.1.x auth screens — overline, title, sub, body, footer.
 *
 * From design/source-prototype/screens/client-auth.jsx `AuthCard`. Reused by
 * 2.1.1 Login through 2.1.7 MFA Challenge, which is why it lives here rather than
 * inside the login route.
 */
export function AuthCard({
  overline,
  title,
  sub,
  children,
  footer,
}: {
  overline?: string;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div>
        {overline && (
          <div className="t-label-s mb-1 text-brand-orange">{overline}</div>
        )}
        <h1 className="t-headline m-0">{title}</h1>
        {sub && <p className="t-body mt-1 mb-0 text-on-surface-variant">{sub}</p>}
      </div>

      {children}

      {footer && (
        <div className="t-body-s mt-auto text-center text-on-surface-variant">
          {footer}
        </div>
      )}
    </>
  );
}
