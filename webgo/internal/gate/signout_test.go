package gate

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
)

// Review (#178): sign-out mounted as Protected bounced a half-assured session to the MFA
// challenge and 503'd during an outage, so neither could sign out.
func TestSignOutAlwaysReachesItsHandler(t *testing.T) {
	for name, st := range map[string]session.State{
		"half-assured (mid-MFA)": {SignedIn: true, HasFactor: true},
		"auth outage":            {Unavailable: true},
		"signed out already":     {},
		"fully signed in":        {SignedIn: true, AAL2: true},
	} {
		rt, mux, _ := newRouter(st, false)
		reached := false
		rt.SignOutRoute("POST /account/sign-out", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got, _ := session.From(r.Context())
			reached = got.SignedIn == st.SignedIn && got.Unavailable == st.Unavailable && got.HasFactor == st.HasFactor
		}))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("POST", "/account/sign-out", nil))
		if !reached || rec.Code != 200 {
			t.Errorf("%s: handler reached=%v status=%d", name, reached, rec.Code)
		}
	}
}

// A wildcard first segment or a host could match gated paths without naming them.
func TestPublicRefusesPatternsThatCouldHideAGate(t *testing.T) {
	for _, pattern := range []string{"GET /{a}/{b...}", "/{rest...}", "example.com/", "GET example.com/dashboard"} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("Public(%q) mounted without complaint", pattern)
				}
			}()
			rt, _, _ := newRouter(session.State{}, false)
			rt.Public(pattern, ok)
		}()
	}
}

// next carries the escaped path, so an encoded ? cannot become a real query on the way back.
func TestNextUsesTheEscapedPath(t *testing.T) {
	rt, mux, _ := newRouter(session.State{}, false)
	rt.Protected("GET /trips/{id}", ok)
	rec := get(mux, "/trips/a%3Fb=1")
	if got, want := rec.Header().Get("Location"), "/login?next=%2Ftrips%2Fa%253Fb%3D1"; got != want {
		t.Errorf("Location = %q, want %q", got, want)
	}
}
