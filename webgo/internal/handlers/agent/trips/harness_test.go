package trips_test

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

// The handler tests run the whole server (gate, session, layout, page) against a fake
// Supabase that plays GoTrue, PostgREST (the platform_user reads and the agent read model's
// RPCs) and the Edge Functions, the way internal/server/flow_test.go does. Every read and
// every function call is recorded with its body, so a test can assert what was asked.

type recorded struct {
	name string
	body map[string]json.RawMessage
}

type reply struct {
	status int
	body   string
}

type fakeSupabase struct {
	mu        sync.Mutex
	role      string // platform_user.role
	aal       string // the access token's aal claim
	hasFactor bool
	reads     map[string]reply // rpc name -> reply
	functions map[string][]reply
	readLog   []recorded
	callLog   []recorded
}

func newFake() *fakeSupabase {
	return &fakeSupabase{role: "agent", aal: "aal2", hasFactor: true,
		reads: map[string]reply{}, functions: map[string][]reply{}}
}

func jwt(claims map[string]any) string {
	b, _ := json.Marshal(claims)
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

// read sets an RPC's reply (200 with body).
func (f *fakeSupabase) read(name, body string) { f.reads[name] = reply{200, body} }

// fn queues a function's replies, used in order (the last one repeats).
func (f *fakeSupabase) fn(name string, rs ...reply) { f.functions[name] = rs }

func (f *fakeSupabase) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	raw, _ := io.ReadAll(r.Body)
	var body map[string]json.RawMessage
	_ = json.Unmarshal(raw, &body)
	switch {
	case r.URL.Path == "/auth/v1/user":
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer h.") {
			w.WriteHeader(401)
			return
		}
		factors := []map[string]string{}
		if f.hasFactor {
			factors = append(factors, map[string]string{"id": "f1", "factor_type": "totp", "status": "verified"})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "u-agent", "email": "advisor@example.test", "factors": factors})
	case r.URL.Path == "/rest/v1/platform_user":
		sel := r.URL.Query().Get("select")
		switch {
		case strings.Contains(sel, "role"):
			_, _ = w.Write([]byte(`[{"role":"` + f.role + `","onboarding_step":null,"onboarding_completed_at":null}]`))
		case strings.Contains(sel, "display_name"):
			_, _ = w.Write([]byte(`[{"display_name":"Gyasi Story","time_zone":"America/Chicago"}]`))
		default:
			_, _ = w.Write([]byte(`[]`))
		}
	case strings.HasPrefix(r.URL.Path, "/rest/v1/rpc/"):
		name := strings.TrimPrefix(r.URL.Path, "/rest/v1/rpc/")
		f.readLog = append(f.readLog, recorded{name, body})
		rp, ok := f.reads[name]
		if !ok {
			w.WriteHeader(500)
			_, _ = w.Write([]byte(`{"code":"XX000","message":"no fake for ` + name + `"}`))
			return
		}
		w.WriteHeader(rp.status)
		_, _ = w.Write([]byte(rp.body))
	case strings.HasPrefix(r.URL.Path, "/functions/v1/"):
		name := strings.TrimPrefix(r.URL.Path, "/functions/v1/")
		f.callLog = append(f.callLog, recorded{name, body})
		rs := f.functions[name]
		if len(rs) == 0 {
			w.WriteHeader(500)
			return
		}
		rp := rs[0]
		if len(rs) > 1 {
			f.functions[name] = rs[1:]
		}
		if rp.status >= 400 {
			w.Header().Set("Content-Type", "application/problem+json")
		}
		w.WriteHeader(rp.status)
		_, _ = w.Write([]byte(rp.body))
	default:
		w.WriteHeader(404)
	}
}

// lastRead is the body of the most recent call to the named read.
func (f *fakeSupabase) lastRead(t *testing.T, name string) map[string]json.RawMessage {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.readLog) - 1; i >= 0; i-- {
		if f.readLog[i].name == name {
			return f.readLog[i].body
		}
	}
	t.Fatalf("read %s was never called", name)
	return nil
}

func (f *fakeSupabase) calls(name string) []recorded {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []recorded
	for _, c := range f.callLog {
		if c.name == name {
			out = append(out, c)
		}
	}
	return out
}

func (f *fakeSupabase) readCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.readLog)
}

type testLog struct{ t *testing.T }

func (l testLog) Write(p []byte) (int, error) {
	l.t.Helper()
	l.t.Log(strings.TrimSpace(string(p)))
	return len(p), nil
}

type app struct {
	t    *testing.T
	h    http.Handler
	fake *fakeSupabase
}

func newApp(t *testing.T) *app {
	t.Helper()
	fake := newFake()
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	cfg := config.Config{Env: config.Development, Port: "8080", SiteURL: "http://localhost:8080",
		SupabaseURL: srv.URL, SupabaseAnonKey: "anon"}
	// Errors reach the test log: a page that fails to fill says why, not just "500".
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewTextHandler(testLog{t}, &slog.HandlerOptions{Level: slog.LevelError})))
	if err != nil {
		t.Fatal(err)
	}
	return &app{t: t, h: h, fake: fake}
}

// session is a signed-in advisor's cookie, its token carrying the fake's aal.
func (a *app) session() *http.Cookie {
	tok := jwt(map[string]any{"sub": "u-agent", "aal": a.fake.aal, "exp": time.Now().Add(time.Hour).Unix()})
	b, _ := json.Marshal(map[string]any{"a": tok, "r": "rt", "e": time.Now().Add(time.Hour).Unix()})
	return &http.Cookie{Name: "sta-session", Value: base64.RawURLEncoding.EncodeToString(b)}
}

func (a *app) get(target string) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest("GET", target, nil)
	req.AddCookie(a.session())
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	return rec
}

func (a *app) post(target string, form url.Values) *httptest.ResponseRecorder {
	a.t.Helper()
	req := httptest.NewRequest("POST", target, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.AddCookie(a.session())
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	return rec
}

// has fails unless the body contains every want.
func has(t *testing.T, rec *httptest.ResponseRecorder, wants ...string) {
	t.Helper()
	body := rec.Body.String()
	for _, w := range wants {
		if !strings.Contains(body, w) {
			t.Errorf("missing %q in the page (status %d)", w, rec.Code)
		}
	}
	if t.Failed() {
		t.Logf("page:\n%s", body)
	}
}

// lacks fails if the body contains any of the strings.
func lacks(t *testing.T, rec *httptest.ResponseRecorder, nots ...string) {
	t.Helper()
	body := rec.Body.String()
	for _, n := range nots {
		if strings.Contains(body, n) {
			t.Errorf("unexpected %q in the page", n)
		}
	}
}

// jsonEq compares a recorded body field with a JSON literal.
func jsonEq(t *testing.T, body map[string]json.RawMessage, key, want string) {
	t.Helper()
	got, ok := body[key]
	if !ok {
		t.Errorf("%s missing from %v", key, keys(body))
		return
	}
	var g, w any
	_ = json.Unmarshal(got, &g)
	if err := json.Unmarshal([]byte(want), &w); err != nil {
		t.Fatalf("bad want %s: %v", want, err)
	}
	gb, _ := json.Marshal(g)
	wb, _ := json.Marshal(w)
	if !bytes.Equal(gb, wb) {
		t.Errorf("%s = %s, want %s", key, gb, wb)
	}
}

func keys(m map[string]json.RawMessage) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}
