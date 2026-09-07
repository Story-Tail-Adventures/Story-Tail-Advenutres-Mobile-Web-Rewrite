import * as React from "react";
/**
 * The shared shell for the 2.1.x auth screens — overline, title, sub, body, footer.
 *
 * From design/source-prototype/screens/client-auth.jsx `AuthCard`. Reused by
 * 2.1.1 Login through 2.1.7 MFA Challenge, which is why it lives here rather than
 * inside the login route.
 */
export declare function AuthCard({ overline, title, sub, children, footer, }: {
    overline?: string;
    title: string;
    sub?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
}): React.JSX.Element;
