import SvgIcon from "@mui/material/SvgIcon";
import { ICON_PATHS, type IconName } from "./icon-paths";

export type { IconName };
export { ICON_NAMES } from "./icon-paths";

export interface IconProps {
  name: IconName;
  /** Rendered size in px. Prototype default is 20. */
  size?: number;
  /** Stroke width. Prototype default is 1.7. */
  strokeWidth?: number;
  /** Fill with currentColor (stars, hearts). */
  filled?: boolean;
  className?: string;
  /**
   * Accessible name. When present the icon is exposed as an image; when absent it is
   * decorative and hidden from assistive tech (the adjacent text carries the meaning).
   */
  label?: string;
}

/**
 * Stroke icon set ported from design/source-prototype/shared/icons.jsx, drawn through MUI's
 * SvgIcon so it sits in MUI slots (IconButton, InputAdornment, Button startIcon) the way the
 * prototype's MuiIcon does.
 *
 * Colour comes only from `currentColor`, so callers use a text colour utility
 * (`className="text-brand-orange"`) or an sx `color` on a wrapper, where the prototype passed
 * `color="var(--brand-orange)"`. Unknown names are a type error rather than a silently
 * empty render.
 *
 * Fill and stroke are attributes on the <path>, not on the root: SvgIcon's own class sets
 * `fill: currentColor` on the <svg>, and a CSS rule beats a presentation attribute, so a
 * `fill="none"` on the root would be ignored. The path's own attribute wins over inheritance.
 *
 * `display: block` keeps the vertical behaviour the Tailwind preflight gave every <svg>
 * (SvgIcon's default is inline-block, which adds descender space inside text).
 *
 * No "use client": Server Components render this directly. icon-paths.ts stays React-free
 * because a Node script generates the Kotlin icon set from it.
 */
export function Icon({
  name,
  size = 20,
  strokeWidth = 1.7,
  filled = false,
  className,
  label,
}: IconProps) {
  return (
    <SvgIcon
      viewBox="0 0 24 24"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      sx={{ display: "block", fontSize: size }}
    >
      <path
        d={ICON_PATHS[name]}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}
