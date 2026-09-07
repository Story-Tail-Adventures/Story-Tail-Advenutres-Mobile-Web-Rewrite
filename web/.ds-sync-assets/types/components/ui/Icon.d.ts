import { type IconName } from "./icon-paths";
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
export declare function Icon({ name, size, strokeWidth, filled, className, label, }: IconProps): import("react").JSX.Element;
