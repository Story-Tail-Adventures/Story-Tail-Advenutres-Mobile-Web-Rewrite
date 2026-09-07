import * as React from "react";
import type { ImageKey } from "../../lib/images";
export type HeroSize = "fill" | "tall" | "normal" | "compact";
export type HeroScrim = "landing" | "topic" | "navy" | "bottom" | "bottom-detail";
export interface HeroBleedProps {
    image: ImageKey;
    size?: HeroSize;
    scrim?: HeroScrim;
    /** Vertical placement of the copy from `md` up; mobile always anchors to the bottom. */
    align?: "center" | "end";
    /** Copy column width: 660 (landing) or 760 (topic / explore). */
    contentWidth?: 660 | 760;
    /** Hero title size class from public.css. */
    titleClass?: "t-hero-l" | "t-hero" | "t-hero-s";
    overline?: string;
    /** Required unless `custom` replaces the copy block. */
    title?: React.ReactNode;
    /** Gold script tail of the headline ("rest.", "world He made."). */
    script?: string;
    sub?: string;
    /** Rendered under the copy (CTAs, scripture strip, chips). */
    children?: React.ReactNode;
    /** Rendered edge-to-edge inside the hero, below the copy (e.g. a search pill). */
    footer?: React.ReactNode;
    /** Replaces the default copy block entirely (2.0.5 detail hero). */
    custom?: React.ReactNode;
    className?: string;
}
/**
 * Full-bleed photo hero with a brand scrim and white/gold copy
 * (design: HeroBleed / MHero, and the hand-built heroes on 2.0.1, 2.0.3, 2.0.5).
 * Everything on the photo is scheme-independent — see public.css.
 */
export declare function HeroBleed({ image, size, scrim, align, contentWidth, titleClass, overline, title, script, sub, children, footer, custom, className, }: HeroBleedProps): React.JSX.Element;
