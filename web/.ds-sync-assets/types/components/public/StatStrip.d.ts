import { type IconName } from "../ui/Icon";
export interface Stat {
    value: string;
    label: string;
    icon: IconName;
}
/**
 * Four-up stats band under the About Gyasi hero (design: C2011 / M2011 stats strip).
 * Values come from the claims registry; the numbers are `text-primary` so they read in
 * the dark scheme (the prototype's burgundy on navy does not).
 */
export declare function StatStrip({ stats }: {
    stats: readonly Stat[];
}): import("react").JSX.Element;
