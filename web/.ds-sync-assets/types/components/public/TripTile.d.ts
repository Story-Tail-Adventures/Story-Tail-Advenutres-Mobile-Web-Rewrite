import type { Topic, Trip } from "../../content/public/types";
interface TripTileProps {
    trip: Trip;
    /** Apply this topic page's placement overrides (tagline, overline, badge). */
    topic?: Topic;
    /** `card` from `md` and `row` below it, unless forced. */
    layout?: "card" | "row" | "responsive";
    /** Path to return to after sign-up (the page this tile is on). */
    next: string;
    className?: string;
}
/**
 * Curated trip tile (design: TripTile = card, MTripTile = mobile row). The title links to the
 * detail page; "Request quote" and the heart go to the sign-up gate with context.
 */
export declare function TripTile({ trip, topic, layout, next, className }: TripTileProps): import("react").JSX.Element;
export {};
