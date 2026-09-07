/**
 * Photography registry for the public surface (Screen Inventory §2.0).
 *
 * PLACEHOLDER IMAGERY. None of it is licensed for Story-Tail's production site
 * (`licensed: false`), and `web/content/public/proof.ts` treats that the same way it treats
 * unverified marketing claims — the strict production gate refuses to build until owned
 * photography lands here. Swapping a photo is a one-line change in this file; no page
 * references a URL directly.
 *
 * EVERY ID HAS BEEN OPENED AND LOOKED AT (2026-09-06). That is not paranoia: the ids copied
 * from the design prototype had drifted badly — `jamaica` ("Cliffs near Negril") was serving
 * the TAJ MAHAL, `honeymoon` ("Couple on a beach") a tent under the Milky Way, `candlelit`
 * the Chicago skyline, `aruba` a group in winter coats round a firepit, and `zipline` had
 * been deleted outright. Nine of fifteen were wrong. Unsplash ids are not stable identifiers
 * for a subject, so an id that was right when it was pasted in is not necessarily right now.
 *
 * The rule this file now follows: THE ALT TEXT MAY NOT CLAIM MORE THAN IS KNOWN. Where
 * Unsplash publishes location metadata it is quoted in a comment above the entry and the
 * place is named in the alt; where it does not, the alt describes what is in the frame and
 * stops there. `stlucia` is the exception that needs no metadata — the Pitons are unique to
 * the island, so the photograph identifies itself.
 *
 * If you change an id, OPEN IT FIRST and make the alt match what you actually see.
 *
 * `unsplashLoader` hands next/image a ready-made Unsplash URL for the width it asks for,
 * so nothing is proxied through /_next/image (no optimizer quota, no remotePatterns).
 * When owned assets replace these, point `src` at /public paths and drop the loader.
 */
import type { ImageLoaderProps } from "next/image";
export declare const UNSPLASH_HOST = "https://images.unsplash.com";
export interface RegisteredImage {
    /** Unsplash photo id today; a /public path once owned assets exist. */
    src: string;
    /** Descriptive alt for when the photo carries meaning. Decorative uses pass alt="". */
    alt: string;
    /** Whether Story-Tail holds a licence to publish this image. */
    licensed: boolean;
}
export declare const STA_IMAGES: {
    readonly turks: {
        readonly src: "photo-1507525428034-b723cf961d3e";
        readonly alt: "Turquoise water and white sand on a Turks and Caicos beach";
        readonly licensed: false;
    };
    readonly bahamas: {
        readonly src: "photo-1707616824227-0f31ee435e73";
        readonly alt: "Palm trees along a boardwalk to the beach at Nassau, The Bahamas";
        readonly licensed: false;
    };
    readonly stlucia: {
        readonly src: "photo-1706645616928-1902d9a6b929";
        readonly alt: "The Pitons rising from the sea in St. Lucia";
        readonly licensed: false;
    };
    readonly jamaica: {
        readonly src: "photo-1716758939770-a5295ccc6be7";
        readonly alt: "Cliffs above clear turquoise water";
        readonly licensed: false;
    };
    readonly aruba: {
        readonly src: "photo-1683782440921-823862401342";
        readonly alt: "Thatched palapas on the palm-lined sand at Arashi Beach, Aruba";
        readonly licensed: false;
    };
    readonly bvi: {
        readonly src: "photo-1769610352818-cf8fa29ccf9a";
        readonly alt: "A catamaran under sail on turquoise water";
        readonly licensed: false;
    };
    readonly resortPool: {
        readonly src: "photo-1582719508461-905c673771fd";
        readonly alt: "Infinity pool at a beachfront resort";
        readonly licensed: false;
    };
    readonly overwater: {
        readonly src: "photo-1738762932370-468a90e0ff68";
        readonly alt: "Overwater bungalows above a calm lagoon";
        readonly licensed: false;
    };
    readonly resortNight: {
        readonly src: "photo-1571896349842-33c89424de2d";
        readonly alt: "Resort lit up at night";
        readonly licensed: false;
    };
    readonly cruiseShip: {
        readonly src: "photo-1548574505-5e239809ee19";
        readonly alt: "Cruise ship at sea";
        readonly licensed: false;
    };
    readonly cruiseAerial: {
        readonly src: "photo-1548574505-5e239809ee19";
        readonly alt: "Cruise ship seen from above";
        readonly licensed: false;
    };
    readonly honeymoon: {
        readonly src: "photo-1497414826197-4166f61a8e14";
        readonly alt: "Couple walking along a beach at golden hour";
        readonly licensed: false;
    };
    readonly candlelit: {
        readonly src: "photo-1536392706976-e486e2ba97af";
        readonly alt: "A long table set with candles and flowers for dinner";
        readonly licensed: false;
    };
    readonly family: {
        readonly src: "photo-1774874016650-976638792231";
        readonly alt: "Water slides above a resort pool";
        readonly licensed: false;
    };
    readonly zipline: {
        readonly src: "photo-1712782516688-cbcbf93b1b7c";
        readonly alt: "A zipline rider crossing a rainforest canopy";
        readonly licensed: false;
    };
    readonly snorkel: {
        readonly src: "photo-1582967788606-a171c1080cb0";
        readonly alt: "Snorkeler over a coral reef";
        readonly licensed: false;
    };
    readonly palmTree: {
        readonly src: "photo-1507525428034-b723cf961d3e";
        readonly alt: "Palm tree over a tropical beach";
        readonly licensed: false;
    };
    readonly sunset: {
        readonly src: "photo-1523595857-fe9ee689f76f";
        readonly alt: "Palm silhouettes against a tropical sunset";
        readonly licensed: false;
    };
};
export type ImageKey = keyof typeof STA_IMAGES;
export declare const IMAGE_KEYS: ImageKey[];
export declare function isImageKey(value: string): value is ImageKey;
/** Build a plain Unsplash URL (for metadata / Open Graph, or non-next/image uses). */
export declare function staImg(key: ImageKey, w?: number, h?: number, q?: number): string;
/**
 * next/image loader for registry images. Receives the registry `src` (the photo id) and
 * returns the Unsplash URL for the requested width. Unsplash serves through imgix, so the
 * resize happens on their CDN and the browser gets an already-sized JPEG/WebP.
 */
export declare function unsplashLoader({ src, width, quality }: ImageLoaderProps): string;
/** Registry keys whose image is not yet licensed for production. */
export declare function unlicensedImages(): ImageKey[];
