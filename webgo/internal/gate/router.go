package gate

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
)

// OutageMessage is shown when sign-in cannot be checked. It is the web app's existing
// sentence for a 5xx (web/lib/auth-errors.ts), reused word for word rather than new copy.
const OutageMessage = "Something went sideways on our end. Try again in a moment."

// Sessions is what the router needs from the session package (*session.Manager).
type Sessions interface {
	Load(w http.ResponseWriter, r *http.Request) session.State
	SyncFlag(w http.ResponseWriter, r *http.Request, signedIn bool)
}

// Router mounts every route under exactly one gate. There is no way to add a route to the
// mux through it without choosing one.
type Router struct {
	mux      *http.ServeMux
	sessions Sessions
	log      *slog.Logger
	// skipAuth is config.AuthChecksDisabledForLocalDev: development with no Supabase at all.
	// Pages render with no session, as the Next.js app did, so design work needs no stack.
	// Load refuses to start production without Supabase, so this can never be true there.
	skipAuth bool
	// mounted records every pattern, so Has can answer for the dev-only harnesses that step
	// aside once a real page takes their route.
	mounted map[string]bool
}

// NewRouter wraps mux.
func NewRouter(mux *http.ServeMux, sessions Sessions, skipAuth bool, log *slog.Logger) *Router {
	return &Router{mux: mux, sessions: sessions, skipAuth: skipAuth, log: log, mounted: map[string]bool{}}
}

// Has reports whether pattern (exactly as written, method included) is already mounted.
func (rt *Router) Has(pattern string) bool { return rt.mounted[pattern] }

func (rt *Router) handle(pattern string, h http.Handler) {
	rt.mux.Handle(pattern, h)
	rt.mounted[pattern] = true
}

// Public mounts a route that reads no session and calls no Supabase. Most of the site.
//
// The literal path is checked against the gated prefixes, so a pattern whose first segment
// is a wildcard ("/{a}/{b...}") or that names a host is refused outright: it could match
// /trips/x or /agent/y without either prefix ever appearing in the pattern.
func (rt *Router) Public(pattern string, h http.Handler) {
	p := patternPath(pattern)
	switch {
	case !strings.HasPrefix(p, "/"):
		panic(fmt.Sprintf("gate: %q names a host; mount paths only", pattern))
	case strings.HasPrefix(p, "/{") && p != "/{$}":
		panic(fmt.Sprintf("gate: %q starts with a wildcard, which could match gated paths", pattern))
	case IsProtected(p) || IsAuthOnly(p) || p == "/{$}":
		panic(fmt.Sprintf("gate: %q is gated; mount it with Protected, AuthOnly or FrontDoor", pattern))
	}
	rt.handle(pattern, h)
}

// SignOutRoute mounts sign-out. It loads the session (so sign-out can revoke the live token)
// but never redirects and never refuses: a half-assured session mid-MFA and a visitor during
// an auth outage must both be able to sign out, and on a shared computer clearing the
// cookies matters most when something else is wrong.
func (rt *Router) SignOutRoute(pattern string, h http.Handler) {
	rt.handle(pattern, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rt.skipAuth {
			h.ServeHTTP(w, r)
			return
		}
		st := rt.sessions.Load(w, r)
		h.ServeHTTP(w, r.WithContext(session.WithState(r.Context(), st)))
	}))
}

// Protected mounts a route that needs a signed-in user. It refuses a path outside
// ProtectedPrefixes, so the list and the routes cannot drift apart.
func (rt *Router) Protected(pattern string, h http.Handler) {
	if p := patternPath(pattern); !IsProtected(p) {
		panic(fmt.Sprintf("gate: %q is not under ProtectedPrefixes; add the prefix first", pattern))
	}
	rt.handle(pattern, rt.wrap(h, true))
}

// AuthOnly mounts an auth screen that a signed-in user is bounced away from.
func (rt *Router) AuthOnly(pattern string, h http.Handler) {
	p := patternPath(pattern)
	if !IsAuthOnly(p) || HasPrefix(p, MFAChallenge) {
		panic(fmt.Sprintf("gate: %q is not an auth-only path (the MFA challenge has its own mount)", pattern))
	}
	rt.handle(pattern, rt.wrap(h, false))
}

// FrontDoor mounts exactly "/": public, except a signed-in visitor goes to the dashboard.
func (rt *Router) FrontDoor(h http.Handler) {
	rt.handle("GET /{$}", rt.wrap(h, false))
}

// MFAChallengeRoute mounts Screen 2.1.7, which needs a half-assured session.
func (rt *Router) MFAChallengeRoute(method string, h http.Handler) {
	rt.handle(strings.TrimSpace(method+" "+MFAChallenge), rt.wrap(h, true))
}

func (rt *Router) wrap(h http.Handler, needsSession bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rt.skipAuth {
			rt.sessions.SyncFlag(w, r, false) // nobody can be signed in without Supabase
			h.ServeHTTP(w, r)
			return
		}

		st := rt.sessions.Load(w, r)
		if st.Unavailable && needsSession {
			// Not "signed out": bouncing to /login would lose their place for an outage.
			rt.log.Warn("auth unavailable on a gated route", "path", r.URL.Path)
			w.Header().Set("Retry-After", "5")
			// The web app's existing 5xx sentence (web/lib/auth-errors.ts), word for word.
			http.Error(w, OutageMessage, http.StatusServiceUnavailable)
			return
		}
		if !st.Unavailable {
			rt.sessions.SyncFlag(w, r, st.SignedIn)
		}

		target := RedirectFor(r.URL.Path, st.SignedIn, AssuranceOf(st), r.URL.Query().Get("next"))
		switch {
		case target == "/login" || target == MFAChallenge:
			// Path only, as the Next.js proxy did, and the ESCAPED path, as nextUrl.pathname
			// is: the decoded one would turn an encoded ? or # into a real query or fragment on
			// the way back. 303 so a POST that lost its session is not replayed at sign-in.
			http.Redirect(w, r, target+"?next="+url.QueryEscape(r.URL.EscapedPath()), http.StatusSeeOther)
		case target != "":
			http.Redirect(w, r, target, http.StatusSeeOther)
		default:
			h.ServeHTTP(w, r.WithContext(session.WithState(r.Context(), st)))
		}
	})
}

// AssuranceOf turns a session's two facts into the gate's three-way answer.
func AssuranceOf(s session.State) Assurance {
	switch {
	case !s.SignedIn:
		return None
	case s.AAL2:
		return Satisfied
	case s.HasFactor:
		return Required
	default:
		return None
	}
}

// patternPath drops a ServeMux pattern's method ("GET /trips/{id}" -> "/trips/{id}").
func patternPath(pattern string) string {
	if _, p, ok := strings.Cut(pattern, " "); ok {
		return strings.TrimSpace(p)
	}
	return pattern
}
