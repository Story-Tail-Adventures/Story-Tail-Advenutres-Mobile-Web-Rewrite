/**
 * Link builders for the public surface, so pages never hand-roll query strings and the
 * sign-up gate can change its parameter names in one place.
 */
export declare const JOIN_INTENTS: readonly ["quote", "save", "message", "tour"];
export type JoinIntent = (typeof JOIN_INTENTS)[number];
export declare function isJoinIntent(value: string | undefined | null): value is JoinIntent;
export interface JoinLink {
    intent?: JoinIntent;
    /** Catalog slug the visitor was looking at. Resolved against the catalog on /join. */
    trip?: string;
    /** Same-origin path to return to after sign-up. */
    next?: string;
}
/** `/join?intent=quote&trip=<slug>&next=/explore/<slug>` (Screen Inventory 2.0.6). */
export declare function joinHref({ intent, trip, next }?: JoinLink): string;
/** `/login?next=…` with the same open-redirect guard. */
export declare function loginHref(next?: string): string;
export declare function tripHref(slug: string): string;
