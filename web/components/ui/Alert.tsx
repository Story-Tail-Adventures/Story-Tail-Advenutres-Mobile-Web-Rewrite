import * as React from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "error" | "success" | "warning" | "info";

const TONE_CLASS: Record<AlertTone, string> = {
  error: "bg-error-container text-on-error-container",
  success: "bg-success-container text-on-surface",
  warning: "bg-warning-container text-on-surface",
  info: "bg-tertiary-container text-on-tertiary-container",
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
}

/**
 * Form-level feedback. `role="alert"` + `aria-live="polite"` so a screen reader
 * announces a failed submit without stealing focus mid-typing.
 */
export function Alert({
  tone = "error",
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "card-flat rounded-md border-0 px-3.5 py-3",
        "t-body-s",
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
