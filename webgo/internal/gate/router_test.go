package gate

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
)

type fakeSessions struct {
	st      session.State
	loads   int
	flagged []bool
}

func (f *fakeSessions) Load(http.ResponseWriter, *http.Request) session.State {
	f.loads++
	return f.st
}

func (f *fakeSessions) SyncFlag(_ http.ResponseWriter, _ *http.Request, signedIn bool) {
	f.flagged = append(f.flagged, signedIn)
}

var ok = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	st, _ := session.From(r.Context())
	if st.SignedIn {
		_, _ = w.Write([]byte("hello " + st.User.ID))
		return
	}
	_, _ = w.Write([]byte("hello"))
})

func newRouter(st session.State, skip bool) (*Router, *http.ServeMux, *fakeSessions) {
	mux := http.NewServeMux()
	fs := &fakeSessions{st: st}
	return NewRouter(mux, fs, skip, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))), mux, fs
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec
}

var signedIn = session.State{SignedIn: true}

// Derived from the prefix lists, so adding a prefix is tested automatically (the role
// proxy.test.ts played for the Next.js matcher).
func TestEveryProtectedPrefixSendsSignedOutToLogin(t *testing.T) {
	rt, mux, _ := newRouter(session.State{}, false)
	for _, p := range ProtectedPrefixes {
		rt.Protected("GET "+p, ok)
	}
	for _, p := range ProtectedPrefixes {
		rec := get(mux, p)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/login?next="+escape(p) {
			t.Errorf("signed-out GET %s = %d %q", p, rec.Code, rec.Header().Get("Location"))
		}
	}
}

func escape(p string) string { return url.QueryEscape(p) }

func TestEveryAuthOnlyPrefixBouncesSignedIn(t *testing.T) {
	rt, mux, _ := newRouter(signedIn, false)
	for _, p := range AuthOnlyPrefixes {
		rt.AuthOnly("GET "+p, ok)
	}
	for _, p := range AuthOnlyPrefixes {
		rec := get(mux, p)
		if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/dashboard" {
			t.Errorf("signed-in GET %s = %d %q", p, rec.Code, rec.Header().Get("Location"))
		}
	}
}

func TestSignedInReachesTheHandlerWithState(t *testing.T) {
	st := session.State{SignedIn: true}
	st.User.ID = "u1"
	rt, mux, fs := newRouter(st, false)
	rt.Protected("GET /dashboard", ok)
	rec := get(mux, "/dashboard")
	if rec.Code != 200 || rec.Body.String() != "hello u1" {
		t.Errorf("GET /dashboard = %d %q", rec.Code, rec.Body.String())
	}
	if len(fs.flagged) != 1 || !fs.flagged[0] {
		t.Errorf("flag sync = %v, want [true]", fs.flagged)
	}
}

func TestHalfAssuredGoesToTheChallenge(t *testing.T) {
	rt, mux, _ := newRouter(session.State{SignedIn: true, HasFactor: true}, false)
	rt.Protected("GET /agent/", ok)
	rec := get(mux, "/agent/worklist")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/login/mfa?next=%2Fagent%2Fworklist" {
		t.Errorf("GET = %d %q", rec.Code, rec.Header().Get("Location"))
	}
}

func TestOutageOnAProtectedRouteIs503NotLogin(t *testing.T) {
	rt, mux, fs := newRouter(session.State{Unavailable: true}, false)
	rt.Protected("GET /dashboard", ok)
	rec := get(mux, "/dashboard")
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Retry-After") == "" {
		t.Errorf("GET = %d", rec.Code)
	}
	if len(fs.flagged) != 0 {
		t.Error("an outage touched the chrome flag")
	}
}

func TestPublicRoutesNeverLoadASession(t *testing.T) {
	rt, mux, fs := newRouter(signedIn, false)
	rt.Public("GET /explore", ok)
	if rec := get(mux, "/explore"); rec.Code != 200 {
		t.Errorf("GET /explore = %d", rec.Code)
	}
	if fs.loads != 0 {
		t.Error("a public route loaded a session")
	}
}

func TestFrontDoor(t *testing.T) {
	rt, mux, _ := newRouter(signedIn, false)
	rt.FrontDoor(ok)
	if rec := get(mux, "/"); rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/dashboard" {
		t.Errorf("signed-in GET / = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	rt2, mux2, _ := newRouter(session.State{}, false)
	rt2.FrontDoor(ok)
	if rec := get(mux2, "/"); rec.Code != 200 {
		t.Errorf("signed-out GET / = %d", rec.Code)
	}
}

func TestChallengeRoute(t *testing.T) {
	rt, mux, _ := newRouter(session.State{SignedIn: true, HasFactor: true}, false)
	rt.MFAChallengeRoute("GET", ok)
	if rec := get(mux, MFAChallenge); rec.Code != 200 {
		t.Errorf("half-assured GET challenge = %d", rec.Code)
	}
	rt2, mux2, _ := newRouter(signedIn, false)
	rt2.MFAChallengeRoute("GET", ok)
	if rec := get(mux2, MFAChallenge); rec.Header().Get("Location") != "/dashboard" {
		t.Errorf("nothing-to-prove GET challenge = %q", rec.Header().Get("Location"))
	}
}

// A POST that lost its session must not be replayed at the sign-in form.
func TestRedirectsAre303(t *testing.T) {
	rt, mux, _ := newRouter(session.State{}, false)
	rt.Protected("POST /trips/{id}/notes", ok)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST", "/trips/1/notes", nil))
	if rec.Code != http.StatusSeeOther {
		t.Errorf("POST = %d, want 303", rec.Code)
	}
}

func TestSkipAuthRendersWithoutASession(t *testing.T) {
	rt, mux, fs := newRouter(signedIn, true)
	rt.Protected("GET /dashboard", ok)
	if rec := get(mux, "/dashboard"); rec.Code != 200 || rec.Body.String() != "hello" {
		t.Errorf("GET = %d %q", rec.Code, rec.Body.String())
	}
	if fs.loads != 0 {
		t.Error("skipAuth still loaded a session")
	}
}

func TestMountsRefuseTheWrongGate(t *testing.T) {
	cases := map[string]func(rt *Router){
		"public on a protected path":  func(rt *Router) { rt.Public("GET /dashboard", ok) },
		"public on an auth-only path": func(rt *Router) { rt.Public("/login", ok) },
		"public on the front door":    func(rt *Router) { rt.Public("GET /{$}", ok) },
		"protected outside the list":  func(rt *Router) { rt.Protected("GET /explore", ok) },
		"protected on a lookalike":    func(rt *Router) { rt.Protected("GET /tripster", ok) },
		"auth-only outside the list":  func(rt *Router) { rt.AuthOnly("GET /dashboard", ok) },
		"auth-only on the challenge":  func(rt *Router) { rt.AuthOnly("GET /login/mfa", ok) },
	}
	for name, mount := range cases {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("%s: mounted without complaint", name)
				}
			}()
			rt, _, _ := newRouter(session.State{}, false)
			mount(rt)
		}()
	}
}

// A redirect the gate decided from the session is that visitor's answer. The front door is a
// page Cloudflare is asked to cache, so a stored 303 would send the next visitor to somebody
// else's destination.
func TestSessionRedirectsAreNeverCached(t *testing.T) {
	cases := map[string]struct {
		state session.State
		mount func(*Router)
		path  string
	}{
		"front door, signed in":   {signedIn, func(rt *Router) { rt.FrontDoor(ok) }, "/"},
		"protected, signed out":   {session.State{}, func(rt *Router) { rt.Protected("GET /agent", ok) }, "/agent"},
		"auth only, signed in":    {signedIn, func(rt *Router) { rt.AuthOnly("GET /login", ok) }, "/login"},
		"half assured to the mfa": {session.State{SignedIn: true, HasFactor: true}, func(rt *Router) { rt.Protected("GET /dashboard", ok) }, "/dashboard"},
	}
	for name, c := range cases {
		rt, mux, _ := newRouter(c.state, false)
		c.mount(rt)
		rec := get(mux, c.path)
		if rec.Code != http.StatusSeeOther {
			t.Errorf("%s: %s = %d, want 303", name, c.path, rec.Code)
			continue
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control %q, want no-store", name, got)
		}
	}
}
