import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * The shared shell for the 2.1.x auth screens — overline, title, sub, body, footer.
 *
 * From design/source-prototype/screens/client-auth.jsx `AuthCard` (the MUI artboards):
 * an overline in the brand orange, an h4 title, a body2 sub, and a caption footer pushed to
 * the bottom of the column. Reused by 2.1.1 Login through 2.1.7 MFA Challenge, which is why
 * it lives here rather than inside the login route. The heading stays an <h1>.
 *
 * The parent column ((auth)/layout.tsx) lays these out with a flex `gap`, so `mt: "auto"`
 * on the footer still reaches the bottom. No "use client": Server Components render this.
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
      <Box>
        {overline && (
          <Typography
            variant="overline"
            sx={{ display: "block", color: "brand.main", fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}
          >
            {overline}
          </Typography>
        )}
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {sub && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {sub}
          </Typography>
        )}
      </Box>

      {children}

      {footer && (
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
          sx={{ display: "block", textAlign: "center", mt: "auto" }}
        >
          {footer}
        </Typography>
      )}
    </>
  );
}
