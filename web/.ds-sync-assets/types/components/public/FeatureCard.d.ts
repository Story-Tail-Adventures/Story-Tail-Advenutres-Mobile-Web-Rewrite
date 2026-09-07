import * as React from "react";
import { type IconName } from "../ui/Icon";
interface FeatureCardProps {
    icon: IconName;
    /** Coloured square behind the icon, or a bare icon. */
    iconTone?: "primary" | "secondary" | "bare";
    /** Square size in px: 32 / 36 / 40 / 44. */
    iconSize?: 32 | 36 | 40 | 44;
    overline?: string;
    title: string;
    body?: string;
    /** Stacked card (steps, pillars, intro band) or icon-beside-text row (mobile lists). */
    layout?: "stack" | "row";
    card?: boolean;
    /** Extra content under the body (e.g. a ScriptureLine). */
    footer?: React.ReactNode;
    titleClass?: string;
    as?: "h3" | "h4" | "div";
    className?: string;
}
/**
 * Icon + overline + title + body (design: the step cards and pillars on 2.0.2, the intro
 * band on 2.0.8, the "what you can do here" rows on mobile 2.0.1).
 */
export declare function FeatureCard({ icon, iconTone, iconSize, overline, title, body, layout, card, footer, titleClass, as: Heading, className, }: FeatureCardProps): React.JSX.Element;
export {};
