import { ImageResponse } from "next/og";

/**
 * Default Open Graph / Twitter card for every route that does not set its own
 * `openGraph.images` (Screen Inventory §2.0; risk plan §SEO). Generated once at build time.
 *
 * Hex literals are acceptable HERE ONLY: ImageResponse (Satori) rasterises this JSX to a PNG and
 * cannot read CSS custom properties or Tailwind classes. The values are the brand tokens from
 * web/styles/tokens.css (--brand-burgundy-dark, --brand-burgundy, --brand-orange, --brand-gold);
 * a share card has no colour scheme, so it is the light-scheme brand gradient in both.
 *
 * Poppins and Caveat are bundled by next/font for the browser only — there are no font files to
 * hand Satori — so the card uses its default bold sans and renders the wordmark as text.
 */
export const alt = "Story-Tail Adventures — Rest is sacred. Wonder is everywhere.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = {
  burgundyDark: "#5C0F13",
  burgundy: "#7A1A1F",
  orange: "#E87722",
  gold: "#FFC83F",
  white: "#FFFFFF",
  whiteSoft: "rgba(255, 255, 255, 0.88)",
} as const;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `linear-gradient(120deg, ${BRAND.burgundyDark} 0%, ${BRAND.burgundy} 55%, ${BRAND.orange} 100%)`,
          color: BRAND.white,
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark: "Story-Tail" + letterspaced ADVENTURES, as in BrandWordmark. */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>Story-Tail</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, color: BRAND.gold }}>
            ADVENTURES
          </div>
        </div>

        {/* Design-System §2.4 signature line. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
            Rest is sacred.
          </div>
          <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
            Wonder is everywhere.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 4, borderRadius: 2, background: BRAND.gold }} />
          <div style={{ fontSize: 26, fontWeight: 500, color: BRAND.whiteSoft }}>
            Trips planned by someone who has done this a hundred times — so you can rest when you get there.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
