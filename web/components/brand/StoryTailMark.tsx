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
export function StoryTailMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        className="sta-mark-light absolute inset-0"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
      >
        <path
          d="M10 44c4 12 18 14 28 10 6-3 9-9 8-15-2 4-7 6-12 5-6-2-8-7-7-12-4 4-12 4-17 12Z"
          fill="#E87722"
        />
        <path
          d="M22 6h22c2 0 4 2 4 4v40c0 2-2 4-4 4H26c-4 0-6-2-6-6V8c0-1 1-2 2-2Z"
          fill="#7A1A1F"
          stroke="#5C0F13"
          strokeWidth="1.4"
        />
        <path d="M24 8v40" stroke="#A53A3F" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="34" cy="28" r="8" stroke="#F1E7D5" strokeWidth="1.6" fill="none" />
        <path
          d="M26 28c2-2 14-2 16 0M34 20c2 4 2 12 0 16M34 20c-2 4-2 12 0 16"
          stroke="#F1E7D5"
          strokeWidth="1.2"
          fill="none"
        />
        <path
          d="M40 19l3-3M40 19l-1 3M40 19l3 0"
          stroke="#F1E7D5"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>

      <svg
        className="sta-mark-dark absolute inset-0"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
      >
        <defs>
          <linearGradient id="staSun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD86B" />
            <stop offset="100%" stopColor="#F58F33" />
          </linearGradient>
          <linearGradient id="staWave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0A4DA3" />
            <stop offset="100%" stopColor="#1E92E5" />
          </linearGradient>
          <linearGradient id="staLeaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6CD279" />
            <stop offset="100%" stopColor="#1FAF45" />
          </linearGradient>
        </defs>
        <path d="M22 44a14 14 0 0 1 28 0H22Z" fill="url(#staSun)" />
        <path
          d="M48 34l3-1.5-2.2-1.6-3 1-3-1.5-1 .5 2 1.6-2.5 1.2-1.6-.7-.7.3 1 1.2-1.2 1.4.6.4 1.7-1 2.6 1 3-1 2 1.4 1.2-.5-2.4-1.8 3-1Z"
          fill="#0D2137"
        />
        <path
          d="M25 42c1-0.8 1.5-0.8 2.4 0M30 41.5c0.8-0.7 1.3-0.7 2 0"
          stroke="#0D2137"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M16 50C16 38 18 28 19 22M21 50c0-10 1-20 2-26"
          stroke="#8A4A1F"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M19 22c-3-3-8-3-11-1 3-1 6 0 8 2-4-1-8 1-10 4 4-2 8-2 10 1-3 0-6 2-7 5 3-2 6-2 9 0M23 18c4-3 10-3 14-1-4-1-8 0-10 2 4-1 9 1 11 4-4-2-9-2-11 1 3 0 7 2 8 5-4-2-8-2-12 0"
          fill="url(#staLeaf)"
          stroke="url(#staLeaf)"
          strokeWidth="0.6"
        />
        <path
          d="M8 46c4-2 8-2 12 0s10 2 14 0 8-2 14 0 8 2 12 0v6c-4 2-8 2-12 0s-8-2-14 0-10 2-14 0-8-2-12 0v-6Z"
          fill="url(#staWave)"
        />
      </svg>
    </span>
  );
}
