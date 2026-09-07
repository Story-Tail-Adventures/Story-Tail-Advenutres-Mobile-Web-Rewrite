import type { ImageKey } from "../../lib/images";
interface MediaCardProps {
    image: ImageKey;
    tag: string;
    title: string;
    body: string;
    /** Stacked (image on top) from `md`, image-beside-text row below it. */
    layout?: "stack" | "row" | "responsive";
    className?: string;
}
/**
 * Image + light tag pill + title + body (design: the "three kinds of cruise" and
 * "three ways to honeymoon" cards on 2.0.9 / 2.0.10, and their mobile rows).
 */
export declare function MediaCard({ image, tag, title, body, layout, className }: MediaCardProps): import("react").JSX.Element;
export {};
