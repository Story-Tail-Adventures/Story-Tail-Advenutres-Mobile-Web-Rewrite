import { type ImageKey } from "../../lib/images";
interface PhotoBase {
    image: ImageKey;
    /** Override the registry alt. Pass "" for decorative photos with adjacent text. */
    alt?: string;
    className?: string;
    /** Heroes above the fold. Next 16: `preload` replaces the deprecated `priority`. */
    preload?: boolean;
    quality?: number;
}
interface FillPhoto extends PhotoBase {
    fill: true;
    /** Required with `fill` so the browser picks a sensible source size. */
    sizes: string;
}
interface FixedPhoto extends PhotoBase {
    fill?: false;
    width: number;
    height: number;
    sizes?: string;
}
export type PhotoProps = FillPhoto | FixedPhoto;
/**
 * The only way public pages render photography. Reads the registry in web/lib/images.ts;
 * the Unsplash resizing happens in the global loader (web/lib/image-loader.ts, registered
 * in next.config.ts), so swapping placeholder photos for owned assets never touches a page.
 */
export declare function Photo(props: PhotoProps): import("react").JSX.Element;
export {};
