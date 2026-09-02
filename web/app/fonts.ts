/**
 * Story-Tail Adventures — bundled brand typefaces.
 *
 * next/font/google downloads these at BUILD time and serves them from
 * /_next/static/media/. There is no runtime request to fonts.googleapis.com,
 * which is what satisfies CLAUDE.md ("Don't load Google Fonts at runtime in
 * production"). The mobile equivalent is composeResources/font/.
 *
 * See docs/Design-System.md §5 for the type system these three back.
 */
import { Poppins, Caveat, JetBrains_Mono } from "next/font/google";

/** Primary sans. Poppins ships as static instances, so the weights are explicit. */
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

/** Script — the "Story-Tail" wordmark only. Variable font, so no weight array. */
export const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

/** Mono — confirmation numbers, keyboard hints. Variable font. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/** Convenience: every font variable, for the <html> className. */
export const fontVariables = [
  poppins.variable,
  caveat.variable,
  jetbrainsMono.variable,
].join(" ");
