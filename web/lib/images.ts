/**
 * Photography registry for the public surface (Screen Inventory §2.0).
 *
 * PLACEHOLDER IMAGERY. Every entry is an Unsplash photo id copied from the design
 * prototype's shared/images.js so the pages match the artboards. None of it is licensed
 * for Story-Tail's production site (`licensed: false`), and `web/content/public/proof.ts`
 * treats that the same way it treats unverified marketing claims — the strict production
 * gate refuses to build until owned photography lands here. Swapping a photo is a one-line
 * change in this file; no page references a URL directly.
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
  bahamas: { src: "photo-1559827260-dc66d52bef19", alt: "Palm trees leaning over a Bahamas beach", licensed: false },
  stlucia: { src: "photo-1473625247510-8ceb1760943f", alt: "Green island peaks rising from the sea in St. Lucia", licensed: false },
  jamaica: { src: "photo-1564507592333-c60657eea523", alt: "Cliffs above clear water near Negril, Jamaica", licensed: false },
  aruba: { src: "photo-1530541930197-ff16ac917b0e", alt: "Palm-lined beach in Aruba", licensed: false },
  bvi: { src: "photo-1473625247510-8ceb1760943f", alt: "Sailing waters of the British Virgin Islands", licensed: false },
  // Resorts and pools
  resortPool: { src: "photo-1582719508461-905c673771fd", alt: "Infinity pool at a beachfront resort", licensed: false },
  overwater: { src: "photo-1540541338287-41700207dee6", alt: "Overwater bungalows above a calm lagoon", licensed: false },
  resortNight: { src: "photo-1571896349842-33c89424de2d", alt: "Resort lit up at night", licensed: false },
  // Cruises
  cruiseShip: { src: "photo-1548574505-5e239809ee19", alt: "Cruise ship at sea", licensed: false },
  cruiseAerial: { src: "photo-1548574505-5e239809ee19", alt: "Cruise ship seen from above", licensed: false },
  // Honeymoon and couples
  honeymoon: { src: "photo-1517824806704-9040b037703b", alt: "Couple walking along a beach at golden hour", licensed: false },
  candlelit: { src: "photo-1519999482648-25049ddd37b1", alt: "Candlelit dinner table for two", licensed: false },
  // Family
  family: { src: "photo-1602002418082-a4443e081dd1", alt: "Family playing in a resort pool", licensed: false },
  // Adventure
  zipline: { src: "photo-1620745137038-d62b1f1c6e63", alt: "Zipline through a rainforest canopy", licensed: false },
  snorkel: { src: "photo-1582967788606-a171c1080cb0", alt: "Snorkeler over a coral reef", licensed: false },
  // Generic tropical
  palmTree: { src: "photo-1507525428034-b723cf961d3e", alt: "Palm tree over a tropical beach", licensed: false },
  sunset: { src: "photo-1506929562872-bb421503ef21", alt: "Palm silhouettes against a tropical sunset", licensed: false },
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
