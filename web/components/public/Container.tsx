import * as React from "react";
import { cn } from "@/lib/cn";

export type ContainerSize = "wide" | "prose" | "narrow";

const SIZE_CLASS: Record<ContainerSize, string> = {
  wide: "pub-container-wide",
  prose: "pub-container-prose",
  narrow: "pub-container-narrow",
};

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** 1280 / 980 / 720 px content width; gutters 18 / 32 / 48 px by breakpoint. */
  size?: ContainerSize;
  as?: "div" | "section" | "article" | "header" | "footer" | "nav";
}

/** Centered content column with the prototype's gutters (`.pub-container` in public.css). */
export function Container({
  size = "wide",
  as: Tag = "div",
  className,
  ...props
}: ContainerProps) {
  return <Tag className={cn("pub-container", SIZE_CLASS[size], className)} {...props} />;
}
