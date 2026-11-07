// Package auth serves the sign-in screens: Screen Inventory §2.1.1 to §2.1.8 (login, register,
// forgot and reset password, verify email, MFA challenge and setup, link account), the routes
// that finish an emailed or OAuth flow (/auth/callback, /auth/confirm, /auth/oauth), sign-out,
// and /api/account/chrome. docs/GO-MIGRATION.md Phase 3.
//
// Every screen ports its Next twin under web/app/(auth) case for case, and its copy word for
// word. Where this file says "Next" it means that code; the long comments there (why a taken
// address reads like success, why the reset form has no email field, why enrolling is a POST)
// are summarised beside each handler and still apply.
//
// The gates, as in web/lib/supabase/middleware.ts:
//
//	AuthOnly            /login, /register, /forgot-password: a signed-in visitor is sent on
//	MFAChallengeRoute   /login/mfa: needs a session, a half-assured one
//	Protected           /mfa/setup: needs a session
//	Public              /reset-password, /verify-email, /link-account, /auth/*, /api/account/chrome:
//	                    deliberately neither. A recovery session IS a session, so auth-only would
//	                    bounce the person resetting their password to the dashboard; protected
//	                    would bounce somebody who is (briefly) signed out. These read the session
//	                    themselves (loadSession) and are never cached.
//	SignOutRoute        /account/sign-out: never refuses
//
// The rules every handler keeps:
//
//   - GoTrue sees the browser (session.Who), never this server (§3.9.6).
//   - A ?next= goes through gate.SafeNext before it is used or even rendered.
//   - Nothing is logged but a GoTrue error's code and status: never an email, a password, a
//     code, a token hash or a name.
//   - A one-time link is never spent on a GET (mail scanners open every link, §3.9).
//   - A new session is written with Sessions.Start, which replaces the cookie whole: there is
//     no pre-sign-in identifier to fixate.
package auth

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Specs declares every page this area fills. The server loads them with the rest at startup.
var Specs = []page.Spec{
	loginSpec, registerSpec, forgotSpec, resetSpec, verifySpec,
	mfaChallengeSpec, mfaSetupSpec, linkSpec, confirmSpec,
}

// formSlots are one form's error alert: the alert, its sentence, and the optional next move.
func formSlots(prefix string) []string {
	return []string{prefix + "-error", prefix + "-error-text", prefix + "-error-action", prefix + "-error-link"}
}

// fieldSlots are one field's input and its error line, plus its hint line when it has one.
func fieldSlots(name string, hint bool) []string {
	s := []string{name, name + "-error"}
	if hint {
		s = append(s, name+"-hint")
	}
	return s
}

func slots(groups ...[]string) []string {
	var out []string
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// area is the auth handlers' shared state.
type area struct {
	handlers.Deps
	// off is development with no Supabase at all: every form answers "not quite ready", as
	// Next did, and the pages still render for design work.
	off bool
	// enrollments holds the MFA setup step between "Show my setup code" and the code.
	enrollments *enrollStore
	now         func() time.Time
}

// Mount registers this area's routes. It runs once at startup; templates are taken here, so a
// missing page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	a := &area{Deps: d, off: d.Config.AuthChecksDisabledForLocalDev(), enrollments: newEnrollStore(time.Now), now: time.Now}
	mounts := []func(*gate.Router) error{
		a.mountLogin, a.mountRegister, a.mountForgot, a.mountReset, a.mountVerify,
		a.mountMFAChallenge, a.mountMFASetup, a.mountLink, a.mountConfirm,
		a.mountCallback, a.mountSignOut, a.mountChrome,
	}
	for _, m := range mounts {
		if err := m(rt); err != nil {
			return err
		}
	}
	return nil
}

// loadSession reads the session on a route no gate loaded it for (the deliberately ungated
// screens), keeping the chrome flag in step as the gate would.
func (a *area) loadSession(w http.ResponseWriter, r *http.Request) session.State {
	if a.off {
		return session.State{}
	}
	st := a.Sessions.Load(w, r)
	if !st.Unavailable {
		a.Sessions.SyncFlag(w, r, st.SignedIn)
	}
	return st
}

// gated is the state the gate stored for a gated route.
func gated(r *http.Request) session.State {
	st, _ := session.From(r.Context())
	return st
}

// mapErr turns a GoTrue failure into the sentence a page shows (web.MapAuthError), the way
// supabase-js handed errors to mapAuthError: a retryable failure has no code and reads as
// "check your connection", and a missing session is a code-less 400.
func mapErr(err error) web.AuthMessage {
	ae := supa.AsAuthError(err)
	switch {
	case ae.Retryable:
		return web.MapAuthError("", 0)
	case ae.Code == "session_not_found":
		return web.MapAuthError("", http.StatusBadRequest)
	}
	return web.MapAuthError(ae.Code, ae.Status)
}

// logErr logs a GoTrue failure by code and status only.
func (a *area) logErr(msg string, err error) {
	ae := supa.AsAuthError(err)
	a.Log.Warn(msg, "code", ae.Code, "status", ae.Status, "retryable", ae.Retryable)
}

// statusFor is the HTTP status a page re-rendered with an auth message carries: an outage or
// a server that is not set up is 503, everything else (a refusal) 422.
func statusFor(m web.AuthMessage) int {
	switch m.Kind {
	case web.Network, web.Unknown, web.NotConfigured:
		return http.StatusServiceUnavailable
	}
	return http.StatusUnprocessableEntity
}

// notConfigured is Next's answer when Supabase is not set up: a normal form error.
func notConfigured() *web.AuthMessage {
	m := web.AuthError(web.NotConfigured)
	return &m
}

// msg is a pointer to a message, for the form-error slot.
func msg(m web.AuthMessage) *web.AuthMessage { return &m }

// render writes an auth page: never cached, the flash taken, the robots rule as a header
// (a page file's own <meta> tags do not reach the layout).
func (a *area) render(w http.ResponseWriter, r *http.Request, d *page.Doc, status int, robots string) {
	shell.FillAuth(d, web.TakeFlash(w, r, a.SecureCookies))
	if robots != "" {
		w.Header().Set("X-Robots-Tag", robots)
	}
	web.Render(w, a.Log, d, status, web.Private)
}

// Robots rules, as each Next page's metadata.robots.
const (
	noIndex         = "noindex"           // { index: false, follow: true }
	noIndexNoFollow = "noindex, nofollow" // { index: false, follow: false }
)

// The OAuth providers' sign-in hosts, the second hop of a social sign-in's redirect chain.
var providerOrigin = map[string]string{
	"google": "https://accounts.google.com",
	"apple":  "https://appleid.apple.com",
}

// allowFormRedirects widens THIS response's form-action for a page whose form legitimately
// leaves the site: Continue with Google posts to /auth/oauth, which redirects to GoTrue's
// /authorize and on to the provider, and Chrome applies the page's form-action to every hop of
// a form submission's redirects. The server-wide policy stays form-action 'self'; only the
// named origins are added, on the pages that need them. If the policy no longer says
// form-action 'self', it is left alone (the feature breaks loudly rather than the CSP
// loosening silently).
func (a *area) allowFormRedirects(w http.ResponseWriter, providers ...string) {
	origins := []string{}
	if a.Config.SupabaseURL != "" {
		origins = append(origins, a.Config.SupabaseURL)
	}
	for _, p := range providers {
		if o, ok := providerOrigin[p]; ok {
			origins = append(origins, o)
		}
	}
	if len(origins) == 0 {
		return
	}
	h := w.Header()
	csp := h.Get("Content-Security-Policy")
	const self = "form-action 'self'"
	if !strings.Contains(csp, self+";") && !strings.HasSuffix(csp, self) {
		return
	}
	h.Set("Content-Security-Policy", strings.Replace(csp, self, self+" "+strings.Join(origins, " "), 1))
}

// enabledProviders lists the providers whose buttons are live.
func (a *area) enabledProviders() []string {
	var out []string
	for _, p := range []string{"google", "apple"} {
		if a.providerEnabled(p) {
			out = append(out, p)
		}
	}
	return out
}

// callbackURL is the absolute /auth/callback address an emailed or OAuth link comes back to,
// carrying next (already safe) and, for OAuth, the provider.
func (a *area) callbackURL(next, provider string) string {
	q := url.Values{"next": {next}}
	if provider != "" {
		q.Set("provider", provider)
	}
	return a.Config.SiteURL + "/auth/callback?" + q.Encode()
}

// withTimeout bounds a best-effort call (push-device at sign-out).
func withTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}
