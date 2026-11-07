package auth_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/server"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The handler tests run the whole server (routes, gates, session cookie, pages) against a fake
// Supabase: GoTrue, PostgREST and the function door. Every request it sees is recorded, so a
// test can say what was (and was NOT) sent.

func token(sub, aal string) string {
	b, _ := json.Marshal(map[string]any{"sub": sub, "aal": aal, "exp": time.Now().Add(time.Hour).Unix()})
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

type call struct {
	Method, Path string
	Query        url.Values
	Header       http.Header
	Body         map[string]any
}

type reply struct {
	status int
	body   any
}

type fakeUser struct {
	ID        string           `json:"id"`
	Email     string           `json:"email"`
	Confirmed *string          `json:"email_confirmed_at"`
	Factors   []map[string]any `json:"factors"`
}

type fake struct {
	t     *testing.T
	mu    sync.Mutex
	calls []call
	// routes answer "METHOD /path" (the path without its query).
	routes map[string]reply
	// users answers GET /auth/v1/user by access token.
	users map[string]fakeUser
	// role is platform_user.role for /rest/v1/platform_user ("" = no row).
	role string
	// clientRows is /rest/v1/client's reply.
	clientRows []map[string]any
}

func newFake(t *testing.T) *fake {
	return &fake{t: t, routes: map[string]reply{}, users: map[string]fakeUser{}}
}

func (f *fake) on(route string, status int, body any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.routes[route] = reply{status, body}
}

func (f *fake) user(tok string, u fakeUser) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.users[tok] = u
}

func (f *fake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, call{r.Method, r.URL.Path, r.URL.Query(), r.Header.Clone(), body})
	w.Header().Set("Content-Type", "application/json")
	send := func(status int, v any) {
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}
	bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	switch {
	case r.Method == "GET" && r.URL.Path == "/auth/v1/user":
		u, ok := f.users[bearer]
		if !ok {
			send(401, map[string]any{"code": "bad_jwt"})
			return
		}
		send(200, u)
		return
	case r.URL.Path == "/auth/v1/logout":
		w.WriteHeader(204)
		return
	case r.URL.Path == "/rest/v1/platform_user":
		if f.role == "" {
			send(200, []any{})
			return
		}
		send(200, []any{map[string]any{"role": f.role, "onboarding_step": nil, "onboarding_completed_at": "2026-01-01"}})
		return
	case r.URL.Path == "/rest/v1/client":
		rows := f.clientRows
		if rows == nil {
			rows = []map[string]any{}
		}
		send(200, rows)
		return
	}
	if rep, ok := f.routes[r.Method+" "+r.URL.Path]; ok {
		send(rep.status, rep.body)
		return
	}
	send(404, map[string]any{"code": "not_found"})
}

// seen returns the recorded calls to "METHOD /path".
func (f *fake) seen(route string) []call {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []call
	for _, c := range f.calls {
		if c.Method+" "+c.Path == route {
			out = append(out, c)
		}
	}
	return out
}

type opts struct {
	env          config.Env
	google       bool
	noSupabase   bool
	secureCookie bool
}

// harness is one server over one fake.
type harness struct {
	t    *testing.T
	h    http.Handler
	f    *fake
	logs *bytes.Buffer
	base string // the fake's URL
}

func newHarness(t *testing.T, o opts) *harness {
	t.Helper()
	f := newFake(t)
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	if o.env == "" {
		o.env = config.Development
	}
	cfg := config.Config{Env: o.env, Port: "8080", SiteURL: "http://localhost:8080",
		GoogleAuthEnabled: o.google}
	if o.secureCookie {
		cfg.SiteURL = "https://site.example"
	}
	if !o.noSupabase {
		cfg.SupabaseURL, cfg.SupabaseAnonKey = srv.URL, "anon"
	}
	logs := &bytes.Buffer{}
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return &harness{t: t, h: h, f: f, logs: logs, base: srv.URL}
}

// client keeps cookies across requests, like a browser.
type client struct {
	hn      *harness
	cookies map[string]*http.Cookie
}

func (hn *harness) client() *client { return &client{hn: hn, cookies: map[string]*http.Cookie{}} }

// signIn gives the client a session for tok (as if a sign-in had set the cookie).
func (c *client) signIn(t *testing.T, email, password, tok string) {
	t.Helper()
	c.hn.f.on("POST /auth/v1/token", 200, map[string]any{"access_token": tok, "refresh_token": "rt-" + tok[len(tok)-6:]})
	rec := c.post("/login", url.Values{"email": {email}, "password": {password}, "next": {"/dashboard"}})
	if rec.Code != 303 || c.cookies["sta-session"] == nil {
		t.Fatalf("sign-in for the test = %d %v", rec.Code, rec.Header())
	}
}

func (c *client) do(method, target string, form url.Values) *httptest.ResponseRecorder {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req := httptest.NewRequest(method, target, body)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Sec-Fetch-Site", "same-origin")
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (test browser)")
	req.Header.Set("X-Forwarded-For", "203.0.113.7")
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	c.hn.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		if ck.MaxAge < 0 {
			delete(c.cookies, ck.Name)
		} else {
			c.cookies[ck.Name] = ck
		}
	}
	return rec
}

func (c *client) get(target string) *httptest.ResponseRecorder { return c.do("GET", target, nil) }
func (c *client) post(target string, form url.Values) *httptest.ResponseRecorder {
	return c.do("POST", target, form)
}

func has(t *testing.T, rec *httptest.ResponseRecorder, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(rec.Body.String(), w) {
			t.Errorf("response lacks %q\n%s", w, rec.Body.String())
		}
	}
}

func hasNot(t *testing.T, rec *httptest.ResponseRecorder, bad ...string) {
	t.Helper()
	for _, b := range bad {
		if strings.Contains(rec.Body.String(), b) {
			t.Errorf("response carries %q", b)
		}
	}
}

func where(t *testing.T, rec *httptest.ResponseRecorder, status int, location string) {
	t.Helper()
	if rec.Code != status || rec.Header().Get("Location") != location {
		t.Errorf("got %d %q, want %d %q\n%s", rec.Code, rec.Header().Get("Location"), status, location, rec.Body.String())
	}
}

// esc is how the page writes an apostrophe.
func esc(s string) string { return strings.ReplaceAll(s, "'", "&#39;") }
