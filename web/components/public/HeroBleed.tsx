import * as React from "react";
import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Photo } from "./Photo";

export type HeroSize = "fill" | "tall" | "normal" | "compact";
export type HeroScrim = "landing" | "topic" | "navy" | "bottom" | "bottom-detail";

const SIZE_CLASS: Record<HeroSize, string> = {
  fill: "hero-fill",
  tall: "hero-tall",
  normal: "hero-normal",
  compact: "hero-compact",
};

const SCRIM_CLASS: Record<HeroScrim, string> = {
  landing: "scrim-landing",
  topic: "scrim-topic",
  navy: "scrim-navy",
  bottom: "scrim-bottom",
  "bottom-detail": "scrim-bottom-detail",
};

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
export function HeroBleed({
  image,
  size = "normal",
  scrim = "topic",
  align = "end",
  contentWidth = 760,
  titleClass = "t-hero",
  overline,
  title,
  script,
  sub,
  children,
  footer,
  custom,
  className,
}: HeroBleedProps) {
  return (
    <section className={cn("on-photo relative flex flex-col overflow-hidden", SIZE_CLASS[size], className)}>
      <Photo image={image} fill sizes="100vw" preload alt="" className="object-cover" />
      <div aria-hidden="true" className={cn("absolute inset-0", SCRIM_CLASS[scrim])} />

      <div
        className={cn(
          // `pub-container-wide` is load-bearing: without a width modifier the hero copy sits
          // at the viewport gutter while SigninBanner and every Container below it centre in
          // 1280px, so they disagree at any width past 1376px. The 1440 artboards align all
          // three (C203 puts hero, banner and body all at a 48px gutter).
          "pub-container pub-container-wide relative flex flex-1 flex-col justify-end pt-20 pb-5 text-white md:pt-10 md:pb-10",
          align === "center" ? "md:justify-center" : "md:justify-end",
        )}
      >
        {custom ?? (
          <div className={cn("flex flex-col", contentWidth === 660 ? "max-w-165" : "max-w-190")}>
            {overline && <p className="t-label-s mb-2 text-brand-gold md:mb-2.5">{overline}</p>}
            <h1 className={cn(titleClass, "text-white")}>
              {title}
              {script && (
                <>
                  {" "}
                  <span className="t-hero-script text-brand-gold">{script}</span>
                </>
              )}
            </h1>
            {sub && <p className="t-hero-sub mt-1.5 max-w-155 text-white/90 md:mt-3">{sub}</p>}
            {children}
          </div>
        )}
        {footer && <div className="mt-4 md:mt-5">{footer}</div>}
      </div>
    </section>
  );
}
