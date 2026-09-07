/**
 * The Story-Tail Adventures logo glyph.
 *
 * Two artworks, swapped by CSS on `.scheme-dark` (see the `.sta-mark-*` rules in
 * web/styles/components.css) rather than by JS, so the correct one is painted on the
 * very first frame with no hydration flash.
 *
 *   light — a book held in a fox tail (burgundy + orange)
 *   dark  — a tropical island: twin palms, sun, wave, plane
 *
 * Traced from design/source-prototype/shared/icons.jsx `StoryTailMark`.
 */
export declare function StoryTailMark({ size }: {
    size?: number;
}): import("react").JSX.Element;
