import { cn } from "@/lib/cn";

interface SectionLabelProps {
  overline?: string;
  title: string;
  sub?: string;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}

/** Overline + section heading + optional sub (design: SectionLabel in the topic pages). */
export function SectionLabel({ overline, title, sub, as: Heading = "h2", id, className }: SectionLabelProps) {
  return (
    <div className={cn("mb-2.5 md:mb-4", className)}>
      {overline && <p className="t-label-s text-brand-orange">{overline}</p>}
      <Heading id={id} className="t-section mt-0.5 mb-1 text-on-surface">
        {title}
      </Heading>
      {sub && <p className="t-body max-w-180 text-on-surface-variant">{sub}</p>}
    </div>
  );
}
