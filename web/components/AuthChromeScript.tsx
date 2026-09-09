import { authFlagScript } from "@/lib/auth/chrome-flag";

/**
 * Sets the auth flag attribute on <html> BEFORE first paint, so the public top bar and the
 * /explore sign-in banner render in the right state on the very first frame.
 *
 * Same shape and same reason as components/ThemeScript.tsx: a render-blocking inline script,
 * not next/script and not an effect. Anything that runs after hydration would show a
 * signed-in visitor "Sign in / Create account" for a frame, and would reflow the page when
 * the banner disappeared.
 *
 * The public pages ship BOTH states in their static HTML and let CSS pick one — the same
 * trick BrandMark uses for the theme-swapped lockup, because neither the scheme nor the
 * session is knowable at prerender time. See styles/public.css for the gate.
 *
 * It reads no environment variables, deliberately: these pages are prerendered, and no
 * prerendered route may touch NEXT_PUBLIC_SUPABASE_* (lib/auth/chrome-flag.ts explains why).
 *
 * <html> already carries suppressHydrationWarning for ThemeScript, which covers this too.
 */
export function AuthChromeScript() {
  return <script dangerouslySetInnerHTML={{ __html: authFlagScript() }} />;
}
