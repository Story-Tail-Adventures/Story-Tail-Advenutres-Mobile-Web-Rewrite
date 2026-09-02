import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Material 3 button, backed by the `.btn` classes ported from the design prototype
 * (web/styles/components.css). Variants match design/source-prototype/styles/app.css.
 */

export type ButtonVariant =
  | "filled"
  | "tonal"
  | "tertiary"
  | "outlined"
  | "text"
  | "elevated"
  | "danger"
  | "orange";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  filled: "btn-filled",
  tonal: "btn-tonal",
  tertiary: "btn-tertiary",
  outlined: "btn-outlined",
  text: "btn-text",
  elevated: "btn-elevated",
  danger: "btn-danger",
  orange: "btn-orange",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = "filled",
  size = "md",
  fullWidth = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}
