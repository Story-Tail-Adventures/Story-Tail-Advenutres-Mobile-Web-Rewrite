import Link from "next/link";
import type { ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";
import { Photo } from "./Photo";

interface ClosingCtaProps {
  image: ImageKey;
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  className?: string;
}

/** Photo band with two CTAs at the end of the topic and advisor pages (design: ClosingCTA). */
export function ClosingCta({ image, title, body, primary, secondary, className }: ClosingCtaProps) {
  return (
    <section className={cn("on-photo relative mt-3 min-h-55 overflow-hidden rounded-3xl", className)}>
      <Photo image={image} fill sizes="(min-width: 1200px) 1280px, 100vw" alt="" className="object-cover" />
      <div aria-hidden="true" className="scrim-cta absolute inset-0" />
      <div className="relative flex flex-col gap-5 p-5 text-white md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-6 md:px-9 md:py-8">
        <div className="max-w-135">
          <h2 className="t-headline-r text-white">{title}</h2>
          <p className="t-body mt-1.5 text-white/90">{body}</p>
        </div>
        <div className="flex flex-col gap-2.5 md:flex-row">
          <Link href={primary.href} className="btn btn-orange btn-lg">
            {primary.label}
          </Link>
          <a href={secondary.href} className="btn btn-glass btn-lg">
            {secondary.label}
          </a>
        </div>
      </div>
    </section>
  );
}
