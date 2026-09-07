interface SectionLabelProps {
    overline?: string;
    title: string;
    sub?: string;
    as?: "h2" | "h3";
    id?: string;
    className?: string;
}
/** Overline + section heading + optional sub (design: SectionLabel in the topic pages). */
export declare function SectionLabel({ overline, title, sub, as: Heading, id, className }: SectionLabelProps): import("react").JSX.Element;
export {};
