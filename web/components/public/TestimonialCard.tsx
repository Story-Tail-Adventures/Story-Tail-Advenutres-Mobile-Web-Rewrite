import type { Testimonial } from "@/content/public/types";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

/**
 * A quote card (design: C2011 / M2011 testimonials). Renders an initials avatar rather
 * than a stock face; the registry keeps every quote `consented: false` until a real,
 * permissioned testimonial replaces it.
 */
export function TestimonialCard({ testimonial, className }: { testimonial: Testimonial; className?: string }) {
  return (
    <figure className={cn("card flex flex-col p-3.5 md:p-4.5", className)}>
      <span aria-hidden="true" className="t-quote-glyph text-brand-orange">
        “
      </span>
      <blockquote className="t-body-s md:t-body mt-1 flex-1 text-pretty text-on-surface">
        {testimonial.quote}
      </blockquote>
      <figcaption className="mt-3 flex items-center gap-2.5 border-t border-outline-variant pt-3 md:mt-3.5 md:pt-3.5">
        <Avatar initials={testimonial.initials} size={30} />
        <div>
          <div className="t-label-l font-semibold text-on-surface">{testimonial.who}</div>
          <div className="t-body-s text-on-surface-variant">{testimonial.trip}</div>
        </div>
      </figcaption>
    </figure>
  );
}
