import * as React from "react";
import MuiContainer from "@mui/material/Container";
import type { SxProps, Theme } from "@mui/material/styles";

export type ContainerSize = "wide" | "prose" | "narrow";

/**
 * 1280 / 980 / 720 px of content. The gutter is `--gutter` from styles/public.css
 * (18 / 32 / 48 px by breakpoint) rather than a breakpoint object here, because `.h-scroll`
 * bleeds out of this column by exactly that variable and the two must never drift apart.
 */
const MAX_WIDTH: Record<ContainerSize, string> = {
  wide: "calc(1280px + 2 * var(--gutter))",
  prose: "calc(980px + 2 * var(--gutter))",
  narrow: "calc(720px + 2 * var(--gutter))",
};

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** 1280 / 980 / 720 px content width; gutters 18 / 32 / 48 px by breakpoint. */
  size?: ContainerSize;
  as?: "div" | "section" | "article" | "header" | "footer" | "nav";
  /** Plain objects only: Server Components render this. */
  sx?: SxProps<Theme>;
}

/**
 * Centered content column with the prototype's gutters, on MUI's Container. `maxWidth`
 * and the gutters are ours (MUI's presets are 600/900/1200/1536 and do not match), so the
 * stock props are switched off and the column is drawn in `sx`.
 *
 * No "use client": every public page renders this.
 */
export function Container({
  size = "wide",
  as = "div",
  className,
  sx,
  ...props
}: ContainerProps) {
  return (
    <MuiContainer
      component={as}
      maxWidth={false}
      disableGutters
      className={className}
      sx={[
        { maxWidth: MAX_WIDTH[size], px: "var(--gutter)" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}
