/**
 * Glyph + "Story-Tail" in Caveat + "ADVENTURES" in Poppins.
 *
 * `onDark` is for the tropical-gradient panels, where the wordmark sits on a fixed
 * dark background regardless of the active colour scheme — so it hard-codes white
 * and sunset gold instead of reading from tokens. Everywhere else, `.brand-mark`
 * handles both schemes on its own.
 *
 * From design/source-prototype/shared/screen-frame.jsx `ScreenSplitBrand`.
 */
export declare function BrandWordmark({ size, onDark, }: {
    size?: number;
    onDark?: boolean;
}): import("react").JSX.Element;
