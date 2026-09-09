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
 * Stroke icon set ported from design/source-prototype/shared/icons.jsx.
 *
 * Colour comes only from `currentColor`, so callers use a text colour utility
 * (`className="text-brand-orange"`) where the prototype passed `color="var(--brand-orange)"`.
 * Unknown names are a type error rather than a silently empty render.
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
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
