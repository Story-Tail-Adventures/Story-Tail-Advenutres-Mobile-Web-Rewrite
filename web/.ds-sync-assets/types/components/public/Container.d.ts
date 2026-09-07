import * as React from "react";
export type ContainerSize = "wide" | "prose" | "narrow";
export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
    /** 1280 / 980 / 720 px content width; gutters 18 / 32 / 48 px by breakpoint. */
    size?: ContainerSize;
    as?: "div" | "section" | "article" | "header" | "footer" | "nav";
}
/** Centered content column with the prototype's gutters (`.pub-container` in public.css). */
export declare function Container({ size, as: Tag, className, ...props }: ContainerProps): React.JSX.Element;
