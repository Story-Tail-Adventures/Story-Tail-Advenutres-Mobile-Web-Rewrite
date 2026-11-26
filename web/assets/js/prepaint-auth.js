// Sets data-sta-auth="1" on <html> BEFORE first paint when the signed-in flag cookie is set,
// so a cached public page paints the right top-bar cluster on its very first frame.
//
// The port of web/components/AuthChromeScript.tsx and authFlagScript() in
// web/lib/auth/chrome-flag.ts, as a file (the CSP allows no inline script). It only ever ADDS
// the attribute: absence is the signed-out default, so a visitor with JS off, cookies blocked
// or no session gets the static HTML unchanged. The cookie is sta-authed=1, written by
// internal/session (SyncFlag), not HttpOnly and carrying no identity. The pattern is
// AUTH_FLAG_PATTERN: anchored so a longer cookie name ending in ours, or a value of 10, does
// not match. The gates that read the attribute are in public.css and shell.css.
(function () {
  try {
    if (new RegExp("(?:^|;\\s*)sta-authed=1(?:;|$)").test(document.cookie)) {
      document.documentElement.setAttribute("data-sta-auth", "1");
    }
  } catch (e) {
    /* Cookies blocked — fall through to the signed-out chrome. */
  }
})();
