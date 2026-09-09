import { cn } from "@/lib/cn";

interface ScriptureLineProps {
  quote: string;
  reference: string;
  /** On photography (landing hero) or on a surface (About pillars). */
  tone?: "on-photo" | "surface";
  className?: string;
}

/**
 * A short quotation in the script face with a small reference label.
 * Design-System §2: the landing and About surfaces are where the voice is most explicit.
 */
export function ScriptureLine({ quote, reference, tone = "surface", className }: ScriptureLineProps) {
  if (tone === "on-photo") {
    return (
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5", className)}>
        <q className="t-script-quote-photo text-brand-gold [quotes:none]">{quote}</q>
        <span className="t-label-s text-white/80 tracking-wider">{reference}</span>
      </span>
    );
  }
  return (
    <div
      className={cn(
        "mt-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-t border-outline-variant pt-3",
        className,
      )}
    >
      <q className="t-script-quote text-script-accent [quotes:none]">{quote}</q>
      <span className="t-label-s whitespace-nowrap text-on-surface-variant tracking-wider">{reference}</span>
    </div>
  );
}
