import * as React from "react";
import MuiAlert from "@mui/material/Alert";

export type AlertTone = "error" | "success" | "warning" | "info";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

/**
 * Form-level feedback on MUI's Alert: `tone` is its `severity`, so the colours are MUI's
 * standard tinted pair for each palette colour (error / success / warning / info), in both
 * schemes, with MUI's radius and body2 type.
 *
 * `role="alert"` + `aria-live="polite"` so a screen reader announces a failed submit without
 * stealing focus mid-typing. Callers override both for a status note (`role="status"`,
 * `aria-live="off"`), which is why they sit before the spread.
 *
 * No severity icon, on purpose for this PR: it would push the message 34px right and the
 * foundation PR keeps every primitive's box where it was. The converted prototype screens
 * pass an icon per alert (`<Alert severity="warning" icon={<MuiIcon name="warning" />}>`);
 * the surface PRs can add that where a screen wants it. The padding (14px by 12px) is the
 * legacy box too.
 *
 * No "use client": Server Components render this.
 */
export function Alert({
  tone = "error",
  className,
  children,
  // The HTML `color` attribute would collide with MUI's `color` prop. Nothing sets it.
  color: _nativeColor,
  ...props
}: AlertProps) {
  return (
    <MuiAlert
      severity={tone}
      icon={false}
      role="alert"
      aria-live="polite"
      className={className}
      sx={{ px: "14px", py: "4px" }}
      {...props}
    >
      {children}
    </MuiAlert>
  );
}
