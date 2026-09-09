// The brand mark — see docs/Design-System.md §11 (Logo Usage) and §9.1 (Top App Bar).
// Chrome rather than a screen, so it has no Screen-Inventory entry of its own; it is
// carried by the P1 surfaces (auth, onboarding, client top bar) and by §2.0's public
// pages. P1.
import lockupDark from "./art/lockup-dark.webp";
import lockupLight from "./art/lockup-light.webp";

/**
 * The Story-Tail Adventures logo — the real artwork, one lockup per colour scheme.
 *
 *   light  the horizontal book-and-fox lockup, 2.52:1
 *   dark   the stacked palm-and-sunset lockup, 0.986:1
 *
 * The two are different compositions, not two colourways of one drawing, so the mark
 * changes shape with the scheme: at a given height the light one is a wide banner and the
 * dark one a compact badge. That is inherent to the artwork, and it is why the bars that
 * hold this are sized off the taller of the two.
 *
 * Both are raster. There is no vector master we can use — the Illustrator/EPS originals
 * need Illustrator, and this box has no tracer. See web/scripts/build-brand-assets.mts.
 *
 * Swapped by CSS on `.scheme-dark` (the `.sta-art-*` rules in web/styles/components.css)
 * rather than in JS, because the scheme is not knowable at SSR: ThemeScript falls back to
 * `prefers-color-scheme` when nothing is stored, so the server cannot pick the right art.
 * It runs synchronously in <head>, so the class is on <html> before <body> is parsed and
 * only the correct image ever gets a box.
 */
const ART = { light: lockupLight, dark: lockupDark } as const;

export type BrandTone = "auto" | "light" | "dark";

export interface BrandMarkProps {
  /**
   * Rendered height of the lockup in CSS px — the same in both schemes; each lockup's
   * width follows from its own aspect.
   *
   * Do not go below 80. The light lockup's "ADVENTURES" line is 8.8% of its height, so at
   * 80px it renders 7px — and at the 26px this component's predecessor used, 2.3px. 80 is
   * the floor at which both lockups stay legible.
   */
  size?: number;
  /**
   * Which artwork the surface behind this calls for.
   *   auto   follow the colour scheme (both images emitted, one hidden)
   *   dark   the surface is always dark — the tropical lockup, whatever the scheme
   *   light  the surface is always light — the book-and-fox lockup
   */
  tone?: BrandTone;
  /**
   * Accessible name. Pass "" where an ancestor <Link> already carries its own aria-label;
   * the mark is then hidden from assistive tech rather than announcing the name twice.
   */
  alt?: string;
}

function Art({
  variant,
  size,
  alt,
  swap,
}: {
  variant: "light" | "dark";
  size: number;
  alt: string;
  swap: boolean;
}) {
  const art = ART[variant];
  return (
    /* next/image buys nothing here: next.config.ts registers a global custom loader that
       passes owned assets straight through, so all <Image> would add is a client runtime
       and an eight-width srcset of the same URL for a logo that renders at one height. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={swap ? `sta-art-${variant}` : "sta-art-fixed"}
      src={art.src}
      // The intrinsic dimensions give the UA an aspect-ratio, so `height: size` resolves to
      // the right box before the bytes land — no layout shift.
      width={art.width}
      height={art.height}
      alt={alt}
      // A lazy image whose element generates no box never intersects, so the hidden half of
      // the swap is never fetched — `display: none` does NOT cancel an <img> request on its
      // own. When the tone is pinned there is one image and it is wanted immediately.
      //
      // fetchPriority stays off the swapped pair on purpose: React hoists a preload for a
      // high-priority image during SSR, which would fetch both halves and undo the above.
      // The pinned case has nothing to lose, so it keeps the hint.
      loading={swap ? "lazy" : "eager"}
      decoding="async"
      fetchPriority={swap ? undefined : "high"}
      // object-fit is inert in the normal case — `width: auto` already gives the right
      // aspect — and load-bearing in the cramped one. Tailwind's preflight sets
      // `img { max-width: 100% }`, and with a definite height and auto width the box is
      // clamped to max-width WITHOUT the height being re-derived (CSS 2.1 §10.4), so the
      // default `object-fit: fill` stretches the artwork rather than scaling it. That bites
      // wherever the mark's 201px (or 302px at size 120) exceeds its container: the 404 at
      // 320px, and the client top bar, whose link has no `shrink-0`. `contain` makes those
      // degrade to a smaller, correctly-proportioned mark instead of a squashed one.
      style={{ height: size, width: "auto", objectFit: "contain" }}
    />
  );
}

export function BrandMark({
  size = 80,
  tone = "auto",
  alt = "Story-Tail Adventures",
}: BrandMarkProps) {
  return (
    <span className="sta-art" aria-hidden={alt === "" ? true : undefined}>
      {tone === "auto" ? (
        <>
          <Art variant="light" size={size} alt={alt} swap />
          <Art variant="dark" size={size} alt={alt} swap />
        </>
      ) : (
        <Art variant={tone} size={size} alt={alt} swap={false} />
      )}
    </span>
  );
}
