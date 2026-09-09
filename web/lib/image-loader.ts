import type { ImageLoaderProps } from "next/image";
import { unsplashLoader } from "./images";

/**
 * Global next/image loader (next.config.ts `images.loaderFile`).
 *
 * Registry photos are Unsplash ids and are resized by Unsplash's CDN. Anything that is
 * already a path or URL — owned assets under /public, generated OG images — is served
 * as-is. Registered globally because a Server Component cannot pass a loader function to
 * the client-side <Image> component.
 */
export default function imageLoader(props: ImageLoaderProps): string {
  if (props.src.startsWith("/") || props.src.startsWith("http")) return props.src;
  return unsplashLoader(props);
}
