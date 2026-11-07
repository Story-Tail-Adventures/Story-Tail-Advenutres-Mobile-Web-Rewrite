package session

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

func jwt(claims map[string]any) string {
	b, _ := json.Marshal(claims)
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

// fakeAuth plays GoTrue: valid access tokens and refresh tokens are listed; refreshing
// rotates the refresh token, the way GoTrue does.
type fakeAuth struct {
	users        map[string]supa.User // access token -> user
	refreshable  map[string]bool      // refresh token -> still valid
	down         bool
	getUserCalls int
	refreshCalls int
	signedOut    []string
}

func (f *fakeAuth) Refresh(_ context.Context, rt string, _ supa.Caller) (supa.Tokens, error) {
	f.refreshCalls++
	if f.down {
		return supa.Tokens{}, supa.ErrUnavailable
	}
	if !f.refreshable[rt] {
		return supa.Tokens{}, supa.ErrUnauthenticated
	}
	delete(f.refreshable, rt)
	access := jwt(map[string]any{"sub": "u1", "aal": "aal1", "n": f.refreshCalls})
	f.users[access] = supa.User{ID: "u1", Email: "ada@example.com"}
	nextRT := rt + "+"
	f.refreshable[nextRT] = true
	return supa.Tokens{AccessToken: access, RefreshToken: nextRT, ExpiresAt: time.Now().Add(time.Hour).Unix()}, nil
}

func (f *fakeAuth) GetUser(_ context.Context, at string, _ supa.Caller) (supa.User, error) {
	f.getUserCalls++
	if f.down {
		return supa.User{}, supa.ErrUnavailable
	}
	u, ok := f.users[at]
	if !ok {
		return supa.User{}, supa.ErrUnauthenticated
	}
	return u, nil
}

func (f *fakeAuth) SignOut(_ context.Context, at string, _ supa.Caller) error {
	f.signedOut = append(f.signedOut, at)
	return nil
}

func newFake() *fakeAuth {
	return &fakeAuth{users: map[string]supa.User{}, refreshable: map[string]bool{}}
}

func manager(f *fakeAuth) *Manager {
	return NewManager(f, true, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)))
}

func requestWith(tok *supa.Tokens, flag bool) *http.Request {
	r := httptest.NewRequest("GET", "/dashboard", nil)
	if tok != nil {
		r.AddCookie(&http.Cookie{Name: SecureCookieName, Value: encode(*tok)})
	}
	if flag {
		r.AddCookie(&http.Cookie{Name: FlagCookie, Value: FlagValue})
	}
	return r
}

func cookie(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestNoCookieMeansNoCall(t *testing.T) {
	f := newFake()
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(nil, false))
	if st.SignedIn || st.Unavailable {
		t.Errorf("state = %+v", st)
	}
	if f.getUserCalls+f.refreshCalls != 0 {
		t.Errorf("GoTrue was called %d times for a visitor with no cookie", f.getUserCalls+f.refreshCalls)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Error("cookies written for a visitor with no session")
	}
}

func TestValidSession(t *testing.T) {
	f := newFake()
	access := jwt(map[string]any{"sub": "u1", "aal": "aal2"})
	f.users[access] = supa.User{ID: "u1", Factors: []supa.Factor{{Status: "verified"}}}
	tok := supa.Tokens{AccessToken: access, RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(&tok, false))
	if !st.SignedIn || !st.AAL2 || !st.HasFactor || st.User.ID != "u1" || st.AccessToken != access {
		t.Errorf("state = %+v", st)
	}
	if f.refreshCalls != 0 {
		t.Error("refreshed a token with an hour left")
	}
	if cookie(rec, SecureCookieName) != nil {
		t.Error("rewrote an unchanged session cookie")
	}
}

// The cookie must carry the rotated refresh token, or the next request uses a dead one.
func TestNearExpiryRefreshesAndWritesTheNewCookie(t *testing.T) {
	f := newFake()
	f.refreshable["r0"] = true
	tok := supa.Tokens{AccessToken: "old", RefreshToken: "r0", ExpiresAt: time.Now().Add(30 * time.Second).Unix()}
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(&tok, false))
	if !st.SignedIn {
		t.Fatalf("state = %+v", st)
	}
	c := cookie(rec, SecureCookieName)
	if c == nil {
		t.Fatal("refreshed session was not written")
	}
	got, ok := decode(c.Value)
	if !ok || got.RefreshToken != "r0+" || got.AccessToken == "old" {
		t.Errorf("cookie holds %+v, want the rotated pair", got)
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
		t.Errorf("cookie attributes: %+v", c)
	}
}

func TestRevokedAccessTokenGetsOneRefresh(t *testing.T) {
	f := newFake()
	f.refreshable["r0"] = true
	tok := supa.Tokens{AccessToken: "revoked", RefreshToken: "r0", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(&tok, false))
	if !st.SignedIn || f.refreshCalls != 1 {
		t.Errorf("state=%+v refreshes=%d", st, f.refreshCalls)
	}
}

func TestDeadSessionIsClearedNotRetried(t *testing.T) {
	f := newFake()
	tok := supa.Tokens{AccessToken: "revoked", RefreshToken: "dead", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(&tok, true))
	if st.SignedIn || st.Unavailable {
		t.Errorf("state = %+v", st)
	}
	if c := cookie(rec, SecureCookieName); c == nil || c.MaxAge >= 0 {
		t.Errorf("dead session cookie not cleared: %+v", c)
	}
	if f.refreshCalls != 1 {
		t.Errorf("refreshes = %d, want exactly one attempt", f.refreshCalls)
	}
}

// An outage is not a sign-out: keep the cookie, report unavailable.
func TestOutageKeepsTheCookie(t *testing.T) {
	f := newFake()
	f.down = true
	tok := supa.Tokens{AccessToken: "a", RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	st := manager(f).Load(rec, requestWith(&tok, true))
	if !st.Unavailable || st.SignedIn {
		t.Errorf("state = %+v", st)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Error("an outage changed the visitor's cookies")
	}
}

func TestGarbageCookieIsCleared(t *testing.T) {
	f := newFake()
	r := httptest.NewRequest("GET", "/dashboard", nil)
	r.AddCookie(&http.Cookie{Name: SecureCookieName, Value: "not-base64-json!!"})
	rec := httptest.NewRecorder()
	if st := manager(f).Load(rec, r); st.SignedIn {
		t.Error("garbage cookie signed someone in")
	}
	if c := cookie(rec, SecureCookieName); c == nil || c.MaxAge >= 0 {
		t.Error("garbage cookie not cleared")
	}
	if f.getUserCalls != 0 {
		t.Error("garbage cookie reached GoTrue")
	}
}

func TestFlagWrittenOnlyWhenItChanges(t *testing.T) {
	m := manager(newFake())
	cases := []struct {
		name     string
		has      bool
		signedIn bool
		want     string // "set", "clear" or ""
	}{
		{"signed in, no flag", false, true, "set"},
		{"signed in, flag present", true, true, ""},
		{"signed out, flag present", true, false, "clear"},
		{"signed out, no flag", false, false, ""},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		m.SyncFlag(rec, requestWith(nil, c.has), c.signedIn)
		got := ""
		if fc := cookie(rec, FlagCookie); fc != nil {
			got = "set"
			if fc.MaxAge < 0 {
				got = "clear"
			}
			if fc.HttpOnly {
				t.Errorf("%s: the flag must be readable by the pre-paint script", c.name)
			}
		}
		if got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

func TestEndSignsOutAndClearsBoth(t *testing.T) {
	f := newFake()
	tok := supa.Tokens{AccessToken: "a1", RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	rec := httptest.NewRecorder()
	manager(f).End(rec, requestWith(&tok, true))
	if len(f.signedOut) != 1 || f.signedOut[0] != "a1" {
		t.Errorf("GoTrue sign-out calls = %v", f.signedOut)
	}
	for _, name := range []string{SecureCookieName, FlagCookie} {
		if c := cookie(rec, name); c == nil || c.MaxAge >= 0 {
			t.Errorf("%s not cleared", name)
		}
	}
}

func TestCookieNeverHoldsAnythingButTokens(t *testing.T) {
	v := encode(supa.Tokens{AccessToken: "a", RefreshToken: "r", ExpiresAt: 1})
	raw, _ := base64.RawURLEncoding.DecodeString(v)
	if got := string(raw); got != `{"a":"a","r":"r","e":1}` || strings.Contains(got, "@") {
		t.Errorf("cookie payload = %s", got)
	}
}

// Over https the session lives only in __Host-sta-session, which a sibling subdomain cannot
// set. A plain sta-session (planted from blog.example.com, say) is never read: it can neither
// swap in somebody else's session nor make Load clear the real one.
func TestSecureServerIgnoresAPlantedPlainCookie(t *testing.T) {
	f := newFake()
	tok := supa.Tokens{AccessToken: jwt(map[string]any{"sub": "u1"}), RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	f.users[tok.AccessToken] = supa.User{ID: "u1", Email: "ada@example.com"}
	planted := supa.Tokens{AccessToken: jwt(map[string]any{"sub": "attacker"}), RefreshToken: "ra", ExpiresAt: tok.ExpiresAt}
	f.users[planted.AccessToken] = supa.User{ID: "attacker", Email: "mallory@example.com"}

	r := httptest.NewRequest("GET", "/dashboard", nil)
	r.AddCookie(&http.Cookie{Name: CookieName, Value: encode(planted)})
	r.AddCookie(&http.Cookie{Name: SecureCookieName, Value: encode(tok)})
	rec := httptest.NewRecorder()
	if st := manager(f).Load(rec, r); st.User.ID != "u1" {
		t.Errorf("the planted cookie won: %+v", st.User)
	}

	r = httptest.NewRequest("GET", "/dashboard", nil)
	r.AddCookie(&http.Cookie{Name: CookieName, Value: "junk"})
	r.AddCookie(&http.Cookie{Name: SecureCookieName, Value: encode(tok)})
	rec = httptest.NewRecorder()
	if st := manager(f).Load(rec, r); !st.SignedIn {
		t.Error("junk in the plain cookie signed the visitor out")
	}
	for _, c := range rec.Result().Cookies() {
		if c.MaxAge < 0 {
			t.Errorf("cleared %s", c.Name)
		}
	}
}
