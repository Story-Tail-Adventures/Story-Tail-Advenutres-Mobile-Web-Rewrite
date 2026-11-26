package people

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
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/static"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The handler tests' world: this sub-area mounted behind the real gate and session, talking to
// a fake Supabase (GoTrue, PostgREST, the Edge Functions) over httptest, the way
// internal/server/flow_test.go drives the whole server.

// fn is one recorded function call.
type fn struct {
	Method string
	Name   string
	Query  url.Values
	Body   map[string]json.RawMessage
	Auth   string
}

// fakeSupa answers as an advisor's Supabase. Set the fields before the first request.
type fakeSupa struct {
	mu sync.Mutex
	// role and the aal of the session's access token.
	role string
	aal  string
	// factor: the account has a verified second factor.
	factor bool
	// displayName and timeZone on platform_user.
	displayName string
	timeZone    string
	// rpc maps a read's name to its JSON reply; failing names answer 500.
	rpc     map[string]string
	failing map[string]bool
	// rpcArgs records the body each read was called with.
	rpcArgs map[string]string
	// functions maps "METHOD name" to {status, body}; calls records every call.
	functions map[string]reply
	calls     []fn
}

type reply struct {
	Status int
	Body   string
}

func newFake() *fakeSupa {
	return &fakeSupa{
		role: "agent", aal: "aal2", factor: true, displayName: "Gyasi Story", timeZone: "America/Chicago",
		rpc: map[string]string{}, failing: map[string]bool{}, rpcArgs: map[string]string{}, functions: map[string]reply{},
	}
}

func fakeJWT(claims map[string]any) string {
	b, _ := json.Marshal(claims)
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

func (f *fakeSupa) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	switch {
	case r.URL.Path == "/auth/v1/user":
		user := map[string]any{"id": "u-gyasi", "email": "gyasi@example.com"}
		if f.factor {
			user["factors"] = []map[string]string{{"id": "f1", "factor_type": "totp", "status": "verified"}}
		}
		_ = json.NewEncoder(w).Encode(user)
	case r.URL.Path == "/rest/v1/platform_user":
		sel := r.URL.Query().Get("select")
		switch {
		case strings.Contains(sel, "role"):
			_ = json.NewEncoder(w).Encode([]map[string]any{{"role": f.role, "onboarding_step": nil, "onboarding_completed_at": "2026-01-01T00:00:00Z"}})
		default:
			_ = json.NewEncoder(w).Encode([]map[string]any{{"display_name": f.displayName, "time_zone": f.timeZone}})
		}
	case strings.HasPrefix(r.URL.Path, "/rest/v1/rpc/"):
		name := strings.TrimPrefix(r.URL.Path, "/rest/v1/rpc/")
		b, _ := io.ReadAll(r.Body)
		f.rpcArgs[name] = string(b)
		if f.failing[name] {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"code":"XX000","message":"boom"}`))
			return
		}
		body, ok := f.rpc[name]
		if !ok {
			body = "[]"
		}
		_, _ = w.Write([]byte(body))
	case strings.HasPrefix(r.URL.Path, "/functions/v1/"):
		name := strings.TrimPrefix(r.URL.Path, "/functions/v1/")
		call := fn{Method: r.Method, Name: name, Query: r.URL.Query(), Auth: r.Header.Get("Authorization")}
		if b, _ := io.ReadAll(r.Body); len(b) > 0 {
			_ = json.Unmarshal(b, &call.Body)
		}
		f.calls = append(f.calls, call)
		rep, ok := f.functions[r.Method+" "+name]
		if !ok {
			rep = reply{Status: 200, Body: `{"ok":true}`}
		}
		if rep.Status >= 400 {
			w.Header().Set("Content-Type", "application/problem+json")
		}
		w.WriteHeader(rep.Status)
		_, _ = w.Write([]byte(rep.Body))
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakeSupa) callsTo(name string) []fn {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []fn
	for _, c := range f.calls {
		if c.Name == name {
			out = append(out, c)
		}
	}
	return out
}

// world is the mounted sub-area plus its fake Supabase.
type world struct {
	t    *testing.T
	h    http.Handler
	fake *fakeSupa
	logs *bytes.Buffer
}

func newWorld(t *testing.T) *world {
	t.Helper()
	fake := newFake()
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)

	assetSet, err := static.Build(assets.FS, static.Bundles)
	if err != nil {
		t.Fatal(err)
	}
	set, err := page.LoadWith(pages.FS, page.Options{Assets: assetSet.Lookup}, Specs...)
	if err != nil {
		t.Fatal(err)
	}
	logs := &bytes.Buffer{}
	log := slog.New(slog.NewTextHandler(logs, nil))
	sc := supa.New(srv.URL, "anon", nil)
	sessions := session.NewManager(sc, false, log)
	mux := http.NewServeMux()
	rt := gate.NewRouter(mux, sessions, false, log)
	d := handlers.Deps{
		Pages: set, Supa: sc, Sessions: sessions, Log: log,
		API:    api.New(api.Config{SupabaseURL: srv.URL, AnonKey: "anon"}, nil, log),
		Config: config.Config{Env: config.Development, SupabaseURL: srv.URL, SupabaseAnonKey: "anon"},
	}
	if err := Mount(rt, d); err != nil {
		t.Fatal(err)
	}
	return &world{t: t, h: http.NewCrossOriginProtection().Handler(mux), fake: fake, logs: logs}
}

// cookie is a session for the fake's advisor, valid for an hour.
func (wd *world) cookie() *http.Cookie {
	access := fakeJWT(map[string]any{"sub": "u-gyasi", "aal": wd.fake.aal, "exp": time.Now().Add(time.Hour).Unix()})
	raw, _ := json.Marshal(map[string]any{"a": access, "r": "rt", "e": time.Now().Add(time.Hour).Unix()})
	return &http.Cookie{Name: session.CookieName, Value: base64.RawURLEncoding.EncodeToString(raw)}
}

// get loads a page as the signed-in advisor.
func (wd *world) get(target string) *httptest.ResponseRecorder {
	wd.t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.AddCookie(wd.cookie())
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// post submits a form as the signed-in advisor, from this site, with extra cookies.
func (wd *world) post(target string, form url.Values, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	wd.t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.AddCookie(wd.cookie())
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// getWith loads a page with extra cookies (a flash, a receipt).
func (wd *world) getWith(target string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	wd.t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.AddCookie(wd.cookie())
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// cookieNamed finds a cookie a response set.
func cookieNamed(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}

// has fails the test unless body contains every want.
func has(t *testing.T, body string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(body, w) {
			t.Errorf("page is missing %q", w)
		}
	}
}

// lacks fails the test if body contains any of these.
func lacks(t *testing.T, body string, unwanted ...string) {
	t.Helper()
	for _, u := range unwanted {
		if strings.Contains(body, u) {
			t.Errorf("page should not contain %q", u)
		}
	}
}
