import { hasPlaceholders, PLACEHOLDER_BANNER, placeholderReport } from "@/content/public/proof";

/**
 * Shown on every public page while any marketing claim, testimonial, photo, price or
 * legal page is still a placeholder (web/content/public/proof.ts). Disappears on its own
 * as content is verified; a strict production build refuses to compile until it would.
 */
export function PlaceholderBanner() {
  const report = placeholderReport();
  if (!hasPlaceholders(report)) return null;
  return (
    <div
      role="note"
      className="placeholder-banner t-body-s bg-warning-container px-4 py-2 text-center text-on-surface"
    >
      {PLACEHOLDER_BANNER}
    </div>
  );
}
