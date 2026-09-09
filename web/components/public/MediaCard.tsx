import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Photo } from "./Photo";

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
export function MediaCard({ image, tag, title, body, layout = "responsive", className }: MediaCardProps) {
  const stack = (
    <article className={cn("card overflow-hidden", layout === "responsive" ? "hidden md:block" : "block", className)}>
      <div className="relative h-40">
        <Photo image={image} fill sizes="(min-width: 1200px) 400px, 50vw" alt="" className="object-cover" />
        <span className="pill-light t-badge absolute top-2.5 left-2.5 rounded-md px-2.25 py-0.75 normal-case">{tag}</span>
      </div>
      <div className="p-4">
        <h3 className="t-title-l text-on-surface">{title}</h3>
        <p className="t-body-s mt-1 text-on-surface-variant">{body}</p>
      </div>
    </article>
  );

  const row = (
    <article className={cn("card overflow-hidden", layout === "responsive" ? "flex md:hidden" : "flex", className)}>
      <div className="relative w-25 shrink-0">
        <Photo image={image} fill sizes="100px" alt="" className="object-cover" />
        <span className="pill-light t-badge-s absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 normal-case">{tag}</span>
      </div>
      <div className="flex-1 p-3">
        <h3 className="t-title-s text-on-surface">{title}</h3>
        <p className="t-label-l mt-1 text-on-surface-variant">{body}</p>
      </div>
    </article>
  );

  if (layout === "stack") return stack;
  if (layout === "row") return row;
  return (
    <>
      {stack}
      {row}
    </>
  );
}
