package people

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
	"slices"
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
	// scoped is the id each canned reply BELONGS to, by argument name. A read whose body
	// names one of these with a different value is answered with no rows, as the database
	// would answer a read for somebody else's record.
	//
	// Recording an argument is not scoping by it: before this, a read that lost or mistook
	// its p_conversation_id was still handed the fixture and still passed. An argument not
	// listed here is not modelled and does not scope, so a read naming none is left alone.
	scoped map[string]string
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
		rpc: map[string]string{}, failing: map[string]bool{}, rpcArgs: map[string]string{},
		scoped: map[string]string{}, functions: map[string]reply{},
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
		var rows []map[string]any
		switch {
		case strings.Contains(sel, "role"):
			rows = []map[string]any{{"role": f.role, "onboarding_step": nil, "onboarding_completed_at": "2026-01-01T00:00:00Z"}}
		default:
			rows = []map[string]any{{"display_name": f.displayName, "time_zone": f.timeZone}}
		}
		_ = json.NewEncoder(w).Encode(matching(rows, r.URL.Query()))
	case strings.HasPrefix(r.URL.Path, "/rest/v1/rpc/"):
		name := strings.TrimPrefix(r.URL.Path, "/rest/v1/rpc/")
		b, _ := io.ReadAll(r.Body)
		f.rpcArgs[name] = string(b)
		// The read has to be FOR the record these fixtures are about.
		if !f.inScope(b) {
			_, _ = w.Write([]byte("[]"))
			return
		}
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

// matching applies the one PostgREST filter a table read here could use: col=eq.value.
// Without it the double answers every lookup with the whole table, so a handler that forgot
// its filter would pass — the gap the traveler session found and fixed first in
// internal/handlers/client/fake_test.go.
//
// Nothing in this area relies on it TODAY: every agent read is an RPC, where the scoping is
// current_agent_id() inside the SECURITY DEFINER function, and the one direct table read
// (platform_user, in loadIdentity) is deliberately unfiltered because the
// platform_user_self_select policy restricts it to the caller's own row. It is here so the
// next table read added to this area cannot be written without its filter and still pass.
//
// A column the fixture does not carry does not filter, so this cannot invalidate a fixture
// written against the permissive version. Anything it does not understand is left alone.
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

// The double's own test. Without it `matching` is unexercised in this area — every read here
// is an RPC — and unexercised code in a test double is how the gap it closes comes back.
func TestFakeAppliesPostgRESTFilters(t *testing.T) {
	rows := []map[string]any{
		{"id": "a", "advisor": "gyasi"},
		{"id": "b", "advisor": "someone-else"},
		{"id": "c"}, // the column is not modelled on this row
	}
	ids := func(got []map[string]any) []string {
		out := []string{}
		for _, r := range got {
			out = append(out, fmt.Sprint(r["id"]))
		}
		return out
	}

	for _, c := range []struct {
		name  string
		query string
		want  []string
	}{
		{"no filter keeps everything", "select=*", []string{"a", "b", "c"}},
		// The point of the whole thing: a filter the handler DID write is applied, so a
		// handler that omits one cannot pass by getting the table back.
		{"eq keeps only the match", "advisor=eq.gyasi", []string{"a", "c"}},
		{"eq that matches nothing empties it", "advisor=eq.nobody", []string{"c"}},
		// What makes it safe to drop into fixtures written against the permissive version.
		{"a column the fixture does not carry does not filter", "missing=eq.anything", []string{"a", "b", "c"}},
		{"select, order and limit are not filters", "select=id&order=id.desc&limit=1", []string{"a", "b", "c"}},
		{"an operator it does not model is left alone", "advisor=gt.gyasi", []string{"a", "b", "c"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			q, err := url.ParseQuery(c.query)
			if err != nil {
				t.Fatal(err)
			}
			if got := ids(matching(rows, q)); !slices.Equal(got, c.want) {
				t.Errorf("matching(%s) = %v, want %v", c.query, got, c.want)
			}
		})
	}
}

// inScope reports whether a read's arguments name the record these fixtures are for. A null
// or absent argument is not a mismatch: plenty of reads here take an optional trip or
// milestone and legitimately pass none.
func (f *fakeSupa) inScope(body []byte) bool {
	if len(f.scoped) == 0 || len(body) == 0 {
		return true
	}
	var args map[string]any
	if json.Unmarshal(body, &args) != nil {
		return true
	}
	for param, want := range f.scoped {
		got, present := args[param]
		if !present || got == nil {
			continue
		}
		if fmt.Sprint(got) != want {
			return false
		}
	}
	return true
}

// scope says which record this world's fixtures belong to. Call it for every id argument the
// handlers under test pass, or the reads naming the others stay unscoped.
func (wd *world) scope(param, id string) {
	wd.fake.mu.Lock()
	defer wd.fake.mu.Unlock()
	wd.fake.scoped[param] = id
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
