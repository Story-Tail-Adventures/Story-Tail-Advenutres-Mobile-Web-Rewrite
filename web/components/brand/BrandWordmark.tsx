import { StoryTailMark } from "./StoryTailMark";

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
export function BrandWordmark({
  size = 32,
  onDark = false,
}: {
  size?: number;
  onDark?: boolean;
}) {
  const scriptSize = Math.round(size * 0.72);
  const taglineSize = Math.max(8, Math.round(size * 0.25));

  return (
    <div className="brand-mark" style={onDark ? { color: "#FFF" } : undefined}>
      <StoryTailMark size={size} />
      <span className="flex flex-col gap-0.5 leading-none">
        <span
          className="mark-script"
          style={{
            fontSize: scriptSize,
            ...(onDark ? { color: "#FFF", background: "none", WebkitTextFillColor: "#FFF" } : {}),
          }}
        >
          Story-Tail
        </span>
        <span
          className={onDark ? undefined : "mark-tagline"}
          style={{
            font: `700 ${taglineSize}px/1 var(--font-sans)`,
            letterSpacing: "2px",
            ...(onDark ? { color: "#FFC83F" } : {}),
          }}
        >
          ADVENTURES
        </span>
      </span>
    </div>
  );
}
