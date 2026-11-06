package gate

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
)

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
}

// NewRouter wraps mux.
func NewRouter(mux *http.ServeMux, sessions Sessions, skipAuth bool, log *slog.Logger) *Router {
	return &Router{mux: mux, sessions: sessions, skipAuth: skipAuth, log: log}
}

// Public mounts a route that reads no session and calls no Supabase. Most of the site.
func (rt *Router) Public(pattern string, h http.Handler) {
	if p := patternPath(pattern); IsProtected(p) || IsAuthOnly(p) || p == "/{$}" {
		panic(fmt.Sprintf("gate: %q is gated; mount it with Protected, AuthOnly or FrontDoor", pattern))
	}
	rt.mux.Handle(pattern, h)
}

// Protected mounts a route that needs a signed-in user. It refuses a path outside
// ProtectedPrefixes, so the list and the routes cannot drift apart.
func (rt *Router) Protected(pattern string, h http.Handler) {
	if p := patternPath(pattern); !IsProtected(p) {
		panic(fmt.Sprintf("gate: %q is not under ProtectedPrefixes; add the prefix first", pattern))
	}
	rt.mux.Handle(pattern, rt.wrap(h, true))
}

// AuthOnly mounts an auth screen that a signed-in user is bounced away from.
func (rt *Router) AuthOnly(pattern string, h http.Handler) {
	p := patternPath(pattern)
	if !IsAuthOnly(p) || HasPrefix(p, MFAChallenge) {
		panic(fmt.Sprintf("gate: %q is not an auth-only path (the MFA challenge has its own mount)", pattern))
	}
	rt.mux.Handle(pattern, rt.wrap(h, false))
}

// FrontDoor mounts exactly "/": public, except a signed-in visitor goes to the dashboard.
func (rt *Router) FrontDoor(h http.Handler) {
	rt.mux.Handle("GET /{$}", rt.wrap(h, false))
}

// MFAChallengeRoute mounts Screen 2.1.7, which needs a half-assured session.
func (rt *Router) MFAChallengeRoute(method string, h http.Handler) {
	rt.mux.Handle(strings.TrimSpace(method+" "+MFAChallenge), rt.wrap(h, true))
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
			http.Error(w, "We couldn't check your sign-in just now. Please try again in a moment.", http.StatusServiceUnavailable)
			return
		}
		if !st.Unavailable {
			rt.sessions.SyncFlag(w, r, st.SignedIn)
		}

		target := RedirectFor(r.URL.Path, st.SignedIn, AssuranceOf(st), r.URL.Query().Get("next"))
		switch {
		case target == "/login" || target == MFAChallenge:
			// Path only, as the Next.js proxy did. 303 so a POST that lost its session is not
			// replayed against the sign-in form.
			http.Redirect(w, r, target+"?next="+url.QueryEscape(r.URL.Path), http.StatusSeeOther)
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
