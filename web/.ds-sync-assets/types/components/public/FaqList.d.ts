import type { FaqItem } from "../../content/public/types";
interface FaqListProps {
    items: readonly FaqItem[];
    /** Shared `name` makes the group an exclusive accordion in browsers that support it. */
    name?: string;
    /** Open the first item, as the artboards do. */
    defaultOpenFirst?: boolean;
    /** Answer type: 13px (About) or 14px (About Gyasi). */
    answerSize?: "s" | "m";
    className?: string;
}
/**
 * Native <details>/<summary> FAQ — no JavaScript, keyboard-operable, and the question is a
 * real heading inside the summary so the outline stays intact.
 */
export declare function FaqList({ items, name, defaultOpenFirst, answerSize, className, }: FaqListProps): import("react").JSX.Element;
export {};
