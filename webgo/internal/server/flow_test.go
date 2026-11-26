package server

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

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// fakeSupabase plays GoTrue and the Edge Functions for the end-to-end tests.
type fakeSupabase struct {
	mu        sync.Mutex
	signOuts  int
	functions []string
	lastAuth  string
}

func jwt(claims map[string]any) string {
	b, _ := json.Marshal(claims)
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

func (f *fakeSupabase) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	access := jwt(map[string]any{"sub": "u-jordan", "aal": "aal1", "exp": time.Now().Add(time.Hour).Unix()})
	switch {
	case r.URL.Path == "/auth/v1/token" && r.URL.Query().Get("grant_type") == "password":
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["email"] != "jordan.hayes@example.com" || body["password"] != "right-password" {
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"code":"invalid_credentials"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": access, "refresh_token": "rt1", "expires_at": time.Now().Add(time.Hour).Unix()})
	case r.URL.Path == "/auth/v1/user":
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer h.") {
			w.WriteHeader(401)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "u-jordan", "email": "jordan.hayes@example.com"})
	case r.URL.Path == "/auth/v1/logout":
		f.signOuts++
		w.WriteHeader(204)
	case strings.HasPrefix(r.URL.Path, "/functions/v1/"):
		f.functions = append(f.functions, r.Method+" "+r.URL.Path)
		f.lastAuth = r.Header.Get("Authorization")
		_, _ = io.Copy(io.Discard, r.Body)
		_, _ = w.Write([]byte(`{"ok":true}`))
	default:
		w.WriteHeader(404)
	}
}

func liveHandler(t *testing.T, env config.Env) (http.Handler, *fakeSupabase) {
	t.Helper()
	fake := &fakeSupabase{}
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	cfg := config.Config{Env: env, Port: "8080", SiteURL: "http://localhost:8080",
		SupabaseURL: srv.URL, SupabaseAnonKey: "anon"}
	h, err := New(cfg, pages.FS, slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return h, fake
}

// browser keeps cookies across requests, like a real one.
type browser struct {
	t       *testing.T
	h       http.Handler
	cookies map[string]*http.Cookie
}

func (b *browser) do(method, target string, form url.Values) *httptest.ResponseRecorder {
	b.t.Helper()
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req := httptest.NewRequest(method, target, body)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Sec-Fetch-Site", "same-origin")
	}
	for _, c := range b.cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	b.h.ServeHTTP(rec, req)
	for _, c := range rec.Result().Cookies() {
		if c.MaxAge < 0 {
			delete(b.cookies, c.Name)
		} else {
			b.cookies[c.Name] = c
		}
	}
	return rec
}

func TestDevSignInFlowEndToEnd(t *testing.T) {
	h, fake := liveHandler(t, config.Development)
	b := &browser{t: t, h: h, cookies: map[string]*http.Cookie{}}

	// Signed out: the protected page sends you to sign in, remembering where you were.
	rec := b.do("GET", "/dashboard", nil)
	if rec.Code != 303 || rec.Header().Get("Location") != "/login?next=%2Fdashboard" {
		t.Fatalf("GET /dashboard signed out = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// A wrong password: 422, the form again, no cookie.
	rec = b.do("POST", "/login", url.Values{"email": {"jordan.hayes@example.com"}, "password": {"wrong"}, "next": {"/dashboard"}})
	if rec.Code != 422 || !strings.Contains(rec.Body.String(), "That email and password don&#39;t match.") {
		t.Fatalf("wrong password = %d\n%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `value="jordan.hayes@example.com"`) {
		t.Error("the email typed was not kept")
	}
	if len(b.cookies) != 0 {
		t.Errorf("a failed sign-in set cookies: %v", b.cookies)
	}

	// The right password: a session cookie, the chrome flag, and on to where they were going.
	rec = b.do("POST", "/login", url.Values{"email": {"jordan.hayes@example.com"}, "password": {"right-password"}, "next": {"/dashboard"}})
	if rec.Code != 303 || rec.Header().Get("Location") != "/dashboard" {
		t.Fatalf("sign-in = %d %q\n%s", rec.Code, rec.Header().Get("Location"), rec.Body.String())
	}
	s, f := b.cookies["sta-session"], b.cookies["sta-authed"]
	if s == nil || !s.HttpOnly || s.SameSite != http.SameSiteLaxMode || f == nil || f.HttpOnly {
		t.Fatalf("cookies after sign-in: session=%+v flag=%+v", s, f)
	}
	if strings.Contains(rec.Body.String(), "right-password") {
		t.Error("the password came back in the response")
	}

	rec = b.do("GET", "/dashboard", nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), ">jordan.hayes@example.com</dd>") || !strings.Contains(rec.Body.String(), ">none</dd>") {
		t.Fatalf("GET /dashboard signed in = %d\n%s", rec.Code, rec.Body.String())
	}

	// Signed in: the sign-in page bounces you to the dashboard; an off-site next is ignored.
	rec = b.do("GET", "/login?next=https://evil.example/", nil)
	if rec.Code != 303 || rec.Header().Get("Location") != "/dashboard" {
		t.Errorf("GET /login signed in = %d %q", rec.Code, rec.Header().Get("Location"))
	}

	// Sign out: GoTrue told, both cookies gone, back to sign-in.
	rec = b.do("POST", "/account/sign-out", url.Values{})
	if rec.Code != 303 || rec.Header().Get("Location") != "/login" {
		t.Errorf("sign-out = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	if fake.signOuts != 1 || len(b.cookies) != 0 {
		t.Errorf("signOuts=%d cookies=%v", fake.signOuts, b.cookies)
	}
	if rec := b.do("GET", "/dashboard", nil); rec.Code != 303 {
		t.Errorf("after sign-out GET /dashboard = %d", rec.Code)
	}
}

func TestSignInRefusesAnOffSiteNext(t *testing.T) {
	h, _ := liveHandler(t, config.Development)
	b := &browser{t: t, h: h, cookies: map[string]*http.Cookie{}}
	rec := b.do("POST", "/login", url.Values{"email": {"jordan.hayes@example.com"}, "password": {"right-password"}, "next": {`/\evil.example`}})
	if rec.Header().Get("Location") != "/dashboard" {
		t.Errorf("Location = %q", rec.Header().Get("Location"))
	}
}

// The harness is development only. In production these paths are plain 404s.
func TestNoDevSignInInProduction(t *testing.T) {
	h, _ := liveHandler(t, config.Production)
	for _, path := range []string{"/login", "/dashboard"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
		if rec.Code != 404 {
			t.Errorf("production GET %s = %d, want 404", path, rec.Code)
		}
	}
}

// Mobile's calls arrive with a bearer token and no browser headers; they pass straight
// through. A cross-site browser POST is refused before the registry runs.
func TestRegistryThroughTheFullStack(t *testing.T) {
	h, fake := liveHandler(t, config.Production)

	req := httptest.NewRequest("POST", "/functions/v1/agent-message", strings.NewReader(`{"op":"send"}`))
	req.Header.Set("Authorization", "Bearer mobile-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Body.String() != `{"ok":true}` {
		t.Errorf("mobile call = %d %s", rec.Code, rec.Body.String())
	}
	if len(fake.functions) != 1 || fake.functions[0] != "POST /functions/v1/agent-message" || fake.lastAuth != "Bearer mobile-token" {
		t.Errorf("upstream saw %v auth=%q", fake.functions, fake.lastAuth)
	}

	req = httptest.NewRequest("POST", "/functions/v1/agent-message", strings.NewReader(`{}`))
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 || len(fake.functions) != 1 {
		t.Errorf("cross-site POST = %d, upstream calls %d", rec.Code, len(fake.functions))
	}
}
