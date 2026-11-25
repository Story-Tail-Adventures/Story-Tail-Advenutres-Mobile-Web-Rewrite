package money

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
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

// The handler tests' world: this sub-area mounted behind the real gate and session, talking
// to a fake Supabase (GoTrue, PostgREST, the Edge Functions) over httptest, the way
// internal/server/flow_test.go drives the whole server.

// fn is one recorded function call.
type fn struct {
	Method string
	Name   string
	Query  url.Values
	Body   map[string]json.RawMessage
	Auth   string
}

type reply struct {
	Status int
	Body   string
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
	// functions maps "METHOD name" to its reply; calls records every call.
	functions map[string]reply
	calls     []fn
}

func newFake() *fakeSupa {
	return &fakeSupa{
		role: "agent", aal: "aal2", factor: true, displayName: "Gyasi Story", timeZone: "America/Chicago",
		rpc: map[string]string{}, failing: map[string]bool{}, rpcArgs: map[string]string{},
		functions: map[string]reply{},
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
		// Through matching, so a read that forgot its filter cannot pass here. The rows
		// carry account_id, which is the column platform_user is scoped by.
		sel := r.URL.Query().Get("select")
		rows := []map[string]any{{"account_id": "u-gyasi", "display_name": f.displayName, "time_zone": f.timeZone}}
		if strings.Contains(sel, "role") {
			rows = []map[string]any{{"account_id": "u-gyasi", "role": f.role, "onboarding_step": nil, "onboarding_completed_at": "2026-01-01T00:00:00Z"}}
		}
		_ = json.NewEncoder(w).Encode(matching(rows, r.URL.Query()))
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
func (wd *world) get(target string, headers ...[2]string) *httptest.ResponseRecorder {
	wd.t.Helper()
	return wd.do(http.MethodGet, target, headers...)
}

func (wd *world) do(method, target string, headers ...[2]string) *httptest.ResponseRecorder {
	wd.t.Helper()
	req := httptest.NewRequest(method, target, nil)
	req.AddCookie(wd.cookie())
	for _, h := range headers {
		req.Header.Set(h[0], h[1])
	}
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// post sends a form as the signed-in advisor.
func (wd *world) post(target string, form url.Values) *httptest.ResponseRecorder {
	wd.t.Helper()
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(wd.cookie())
	rec := httptest.NewRecorder()
	wd.h.ServeHTTP(rec, req)
	return rec
}

// matching applies the one PostgREST filter these tests depend on: col=eq.value. Without it
// the double answers every lookup with the whole table, so a handler that FORGOT its filter
// would pass — and in an agent area a missing filter is a cross-advisor read, not an empty
// page. Anything it does not understand (select, order, limit) is left alone.
//
// "A column the fixture does not carry does not filter" is what makes this safe to add to
// an area with existing fixtures: it bites only where the column is actually seeded.
//
// Found by the traveler session (internal/handlers/client/fake_test.go, 19068a1) and shared
// across the areas; this is a deliberate twin of that one.
func matching(rows []map[string]any, q url.Values) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		keep := true
		for key, values := range q {
			switch key {
			case "select", "order", "limit", "offset":
				continue
			}
			want, ok := strings.CutPrefix(values[0], "eq.")
			if !ok {
				continue
			}
			if got, present := row[key]; present && fmt.Sprint(got) != want {
				keep = false
			}
		}
		if keep {
			out = append(out, row)
		}
	}
	return out
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
