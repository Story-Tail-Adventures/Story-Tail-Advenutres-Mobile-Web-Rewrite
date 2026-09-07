import * as React from "react";
export interface ImageLoaderProps {
    src: string;
    width: number;
    quality?: number;
}
export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    sizes?: string;
    quality?: number;
    preload?: boolean;
    priority?: boolean;
    unoptimized?: boolean;
    placeholder?: string;
    blurDataURL?: string;
    loader?: unknown;
}
export declare function Image({ src, alt, width, height, fill, sizes, quality, preload, priority, unoptimized, placeholder, blurDataURL, loader, style, ...rest }: ImageProps): React.JSX.Element;
export default Image;
