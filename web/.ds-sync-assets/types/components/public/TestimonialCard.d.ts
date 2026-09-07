import type { Testimonial } from "../../content/public/types";
/**
 * A quote card (design: C2011 / M2011 testimonials). Renders an initials avatar rather
 * than a stock face; the registry keeps every quote `consented: false` until a real,
 * permissioned testimonial replaces it.
 */
export declare function TestimonialCard({ testimonial, className }: {
    testimonial: Testimonial;
    className?: string;
}): import("react").JSX.Element;
