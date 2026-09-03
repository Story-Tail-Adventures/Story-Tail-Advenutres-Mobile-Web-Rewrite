import Link from "next/link";
import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Photo } from "./Photo";

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

const ASPECT_CLASS = {
  "5/3": "aspect-5/3",
  "5/4": "aspect-5/4",
  "4/5": "aspect-4/5",
} as const;

/**
 * Photo tile with a bottom scrim and a label — inspiration tiles (2.0.3) and island tiles
 * (2.0.8). The whole tile is one link; the image is decorative because the label is the text.
 */
export function PhotoTile({
  image,
  label,
  sub,
  href,
  aspect = "5/3",
  strip = false,
  scrim = "bottom",
  sizes = "(min-width: 1200px) 400px, (min-width: 768px) 50vw, 100vw",
  className,
}: PhotoTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "card group relative block overflow-hidden",
        ASPECT_CLASS[aspect],
        strip && "w-27.5 shrink-0",
        className,
      )}
    >
      <Photo
        image={image}
        fill
        sizes={strip ? "110px" : sizes}
        alt=""
        className="object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <div aria-hidden="true" className={cn("absolute inset-0", scrim === "bottom" ? "scrim-bottom" : "scrim-bottom-island")} />
      <div className={cn("absolute inset-x-2.5 bottom-2.5 text-white", strip ? "inset-x-2 bottom-2" : "md:inset-x-3")}>
        <div className={strip || aspect === "4/5" ? "t-tile-s" : "t-tile"}>{label}</div>
        {sub && <div className="t-fine mt-0.5 opacity-85">{sub}</div>}
      </div>
    </Link>
  );
}
