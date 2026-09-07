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
export declare function ScriptureLine({ quote, reference, tone, className }: ScriptureLineProps): import("react").JSX.Element;
export {};
