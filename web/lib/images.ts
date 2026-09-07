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

export const UNSPLASH_HOST = "https://images.unsplash.com";

export interface RegisteredImage {
  /** Unsplash photo id today; a /public path once owned assets exist. */
  src: string;
  /** Descriptive alt for when the photo carries meaning. Decorative uses pass alt="". */
  alt: string;
  /** Whether Story-Tail holds a licence to publish this image. */
  licensed: boolean;
}

export const STA_IMAGES = {
  // Caribbean beaches
  turks: { src: "photo-1507525428034-b723cf961d3e", alt: "Turquoise water and white sand on a Turks and Caicos beach", licensed: false },
  // Unsplash location: "Nassau, The Bahamas".
  bahamas: { src: "photo-1707616824227-0f31ee435e73", alt: "Palm trees along a boardwalk to the beach at Nassau, The Bahamas", licensed: false },
  // The Pitons are unique to St. Lucia, so this one is verifiable from the photo itself.
  stlucia: { src: "photo-1706645616928-1902d9a6b929", alt: "The Pitons rising from the sea in St. Lucia", licensed: false },
  // No location metadata on Unsplash, so the alt describes the scene without claiming Negril.
  jamaica: { src: "photo-1716758939770-a5295ccc6be7", alt: "Cliffs above clear turquoise water", licensed: false },
  // Unsplash location: "Arashi Beach, Noord, Aruba".
  aruba: { src: "photo-1683782440921-823862401342", alt: "Thatched palapas on the palm-lined sand at Arashi Beach, Aruba", licensed: false },
  // No location metadata, so the alt says what is in frame. A catamaran is the right subject:
  // the catalog's BVI trip is a 7-night skippered cat.
  bvi: { src: "photo-1769610352818-cf8fa29ccf9a", alt: "A catamaran under sail on turquoise water", licensed: false },
  // Resorts and pools
  resortPool: { src: "photo-1582719508461-905c673771fd", alt: "Infinity pool at a beachfront resort", licensed: false },
  overwater: { src: "photo-1738762932370-468a90e0ff68", alt: "Overwater bungalows above a calm lagoon", licensed: false },
  resortNight: { src: "photo-1571896349842-33c89424de2d", alt: "Resort lit up at night", licensed: false },
  // Cruises
  cruiseShip: { src: "photo-1548574505-5e239809ee19", alt: "Cruise ship at sea", licensed: false },
  cruiseAerial: { src: "photo-1548574505-5e239809ee19", alt: "Cruise ship seen from above", licensed: false },
  // Honeymoon and couples
  honeymoon: { src: "photo-1497414826197-4166f61a8e14", alt: "Couple walking along a beach at golden hour", licensed: false },
  // A long table rather than a two-top; the alt says so rather than the other way round.
  candlelit: { src: "photo-1536392706976-e486e2ba97af", alt: "A long table set with candles and flowers for dinner", licensed: false },
  // Family
  // Deliberately a pool with no people in it. The Unsplash License grants no model release,
  // so a frame full of identifiable children is the one to avoid, not the one to look for.
  family: { src: "photo-1774874016650-976638792231", alt: "Water slides above a resort pool", licensed: false },
  // Adventure
  zipline: { src: "photo-1712782516688-cbcbf93b1b7c", alt: "A zipline rider crossing a rainforest canopy", licensed: false },
  snorkel: { src: "photo-1582967788606-a171c1080cb0", alt: "Snorkeler over a coral reef", licensed: false },
  // Generic tropical
  palmTree: { src: "photo-1507525428034-b723cf961d3e", alt: "Palm tree over a tropical beach", licensed: false },
  sunset: { src: "photo-1523595857-fe9ee689f76f", alt: "Palm silhouettes against a tropical sunset", licensed: false },
} as const satisfies Record<string, RegisteredImage>;

export type ImageKey = keyof typeof STA_IMAGES;

export const IMAGE_KEYS = Object.keys(STA_IMAGES) as ImageKey[];

export function isImageKey(value: string): value is ImageKey {
  return Object.prototype.hasOwnProperty.call(STA_IMAGES, value);
}

/** Build a plain Unsplash URL (for metadata / Open Graph, or non-next/image uses). */
export function staImg(key: ImageKey, w = 800, h?: number, q = 80): string {
  const params = new URLSearchParams({
    w: String(w),
    q: String(q),
    auto: "format",
    fit: "crop",
  });
  if (h) params.set("h", String(h));
  return `${UNSPLASH_HOST}/${STA_IMAGES[key].src}?${params.toString()}`;
}

/**
 * next/image loader for registry images. Receives the registry `src` (the photo id) and
 * returns the Unsplash URL for the requested width. Unsplash serves through imgix, so the
 * resize happens on their CDN and the browser gets an already-sized JPEG/WebP.
 */
export function unsplashLoader({ src, width, quality }: ImageLoaderProps): string {
  const params = new URLSearchParams({
    w: String(width),
    q: String(quality ?? 80),
    auto: "format",
    fit: "crop",
  });
  return `${UNSPLASH_HOST}/${src}?${params.toString()}`;
}

/** Registry keys whose image is not yet licensed for production. */
export function unlicensedImages(): ImageKey[] {
  return IMAGE_KEYS.filter((key) => !STA_IMAGES[key].licensed);
}
