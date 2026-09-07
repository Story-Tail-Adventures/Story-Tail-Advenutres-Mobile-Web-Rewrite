import type { ImageKey } from "../../lib/images";
interface PhotoTileProps {
    image: ImageKey;
    label: string;
    sub?: string;
    href: string;
    /** 5/3 (inspiration, web), 5/4 (inspiration, mobile), 4/5 (islands). */
    aspect?: "5/3" | "5/4" | "4/5";
    /** 110px-wide tile for the mobile horizontal island strip. */
    strip?: boolean;
    scrim?: "bottom" | "bottom-island";
    /** Responsive image sizes hint. */
    sizes?: string;
    className?: string;
}
/**
 * Photo tile with a bottom scrim and a label — inspiration tiles (2.0.3) and island tiles
 * (2.0.8). The whole tile is one link; the image is decorative because the label is the text.
 */
export declare function PhotoTile({ image, label, sub, href, aspect, strip, scrim, sizes, className, }: PhotoTileProps): import("react").JSX.Element;
export {};
