/** First focusable element on every public page; visible only while focused. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="btn btn-filled btn-sm sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >
      Skip to content
    </a>
  );
}
