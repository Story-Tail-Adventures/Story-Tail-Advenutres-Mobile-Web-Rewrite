import * as React from "react";
export type AlertTone = "error" | "success" | "warning" | "info";
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
    tone?: AlertTone;
}
/**
 * Form-level feedback. `role="alert"` + `aria-live="polite"` so a screen reader
 * announces a failed submit without stealing focus mid-typing.
 */
export declare function Alert({ tone, className, children, ...props }: AlertProps): React.JSX.Element;
