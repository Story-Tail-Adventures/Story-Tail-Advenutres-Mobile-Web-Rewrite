import * as React from "react";
import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button";

/**
 * Material 3 button on stock MUI. The legacy `.btn-*` classes map per docs/Design-System.md §8
 * and the converted prototype screens (design/source-prototype/screens/*.jsx):
 *
 *   filled   → contained primary        danger   → contained error
 *   tonal    → outlined secondary       orange   → contained brand
 *   tertiary → outlined tertiary        elevated → text on background.paper + boxShadow 1
 *   outlined → outlined primary         text     → text primary
 *
 * Colours, radius (4px), elevation, type (sentence case) and the ripple / focus ring are
 * MUI's. The BOX is the legacy one, so no page reflows: 40px (sm 32, lg 48) min-height,
 * 24px (sm 16, lg 28; text 12) horizontal padding, 8px gap for an inline icon or Spinner,
 * and no wrapping. Callers keep passing layout utilities through `className`.
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

type Look = Pick<MuiButtonProps, "variant" | "color" | "sx">;

const VARIANT_PROPS: Record<ButtonVariant, Look> = {
  filled: { variant: "contained", color: "primary" },
  tonal: { variant: "outlined", color: "secondary" },
  tertiary: { variant: "outlined", color: "tertiary" },
  outlined: { variant: "outlined", color: "primary" },
  text: { variant: "text", color: "primary" },
  elevated: {
    variant: "text",
    color: "primary",
    sx: { bgcolor: "background.paper", boxShadow: 1 },
  },
  danger: { variant: "contained", color: "error" },
  orange: { variant: "contained", color: "brand" },
};

const SIZE_PROPS: Record<
  ButtonSize,
  { size: NonNullable<MuiButtonProps["size"]>; minHeight: number; px: string }
> = {
  sm: { size: "small", minHeight: 32, px: "16px" },
  md: { size: "medium", minHeight: 40, px: "24px" },
  lg: { size: "large", minHeight: 48, px: "28px" },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * `type` defaults to "button" so a Button inside a server-action form never submits by
 * accident; pass `type="submit"` for the one that should. No "use client": Server Components
 * render this with server actions and plain props.
 */
export function Button({
  variant = "filled",
  size = "md",
  fullWidth = false,
  className,
  type = "button",
  // The HTML `color` attribute would collide with MUI's palette `color` prop. Nothing sets it.
  color: _nativeColor,
  ...props
}: ButtonProps) {
  const look = VARIANT_PROPS[variant];
  const dims = SIZE_PROPS[size];
  // .btn-text had 12px padding at the default size; .btn-sm / .btn-lg overrode it.
  const px = variant === "text" && size === "md" ? "12px" : dims.px;

  return (
    <MuiButton
      variant={look.variant}
      color={look.color}
      size={dims.size}
      fullWidth={fullWidth}
      type={type}
      className={className}
      sx={{ ...look.sx, minHeight: dims.minHeight, px, gap: 1, whiteSpace: "nowrap" }}
      {...props}
    />
  );
}
