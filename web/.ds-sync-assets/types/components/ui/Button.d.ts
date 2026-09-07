import * as React from "react";
/**
 * Material 3 button, backed by the `.btn` classes ported from the design prototype
 * (web/styles/components.css). Variants match design/source-prototype/styles/app.css.
 */
export type ButtonVariant = "filled" | "tonal" | "tertiary" | "outlined" | "text" | "elevated" | "danger" | "orange";
export type ButtonSize = "sm" | "md" | "lg";
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
}
export declare function Button({ variant, size, fullWidth, className, type, ...props }: ButtonProps): React.JSX.Element;
