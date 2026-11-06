package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// fakeSupabase answers GoTrue's /auth/v1/user for the tokens it knows, and PostgREST's
// platform_user lookup. Anything else is a 404, and every request is recorded.
type fakeSupabase struct {
	mu    sync.Mutex
	users map[string]string // token -> user id
	rows  map[string]string // user id -> platform_user JSON array
	seen  []string
}

func (f *fakeSupabase) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.seen = append(f.seen, r.Method+" "+r.URL.Path)
	f.mu.Unlock()
	switch {
	case r.URL.Path == "/auth/v1/user":
		id, ok := f.users[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
		if !ok {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"msg":"invalid JWT"}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"` + id + `"}`))
	case r.URL.Path == "/rest/v1/platform_user":
		if r.Header.Get("Authorization") != "Bearer service-key" {
			w.WriteHeader(401)
			return
		}
		id := strings.TrimPrefix(r.URL.Query().Get("account_id"), "eq.")
		row, ok := f.rows[id]
		if !ok {
			row = "[]"
		}
		_, _ = w.Write([]byte(row))
	default:
		w.WriteHeader(404)
	}
}

// jwt builds an unsigned token whose claims RequireUser reads after GoTrue accepted it.
func jwt(claims string) string {
	enc := base64.RawURLEncoding.EncodeToString
	return enc([]byte(`{"alg":"none"}`)) + "." + enc([]byte(claims)) + ".sig"
}

var (
	travelerToken = jwt(`{"sub":"u-traveler","aal":"aal1"}`)
	agentToken    = jwt(`{"sub":"u-agent","aal":"aal2","amr":[{"method":"password","timestamp":1700000000},{"method":"totp","timestamp":1700000100}]}`)
	lockedToken   = jwt(`{"sub":"u-locked"}`)
	orphanToken   = jwt(`{"sub":"u-orphan"}`)
)

func newFake() *fakeSupabase {
	return &fakeSupabase{
		users: map[string]string{travelerToken: "u-traveler", agentToken: "u-agent", lockedToken: "u-locked", orphanToken: "u-orphan"},
		rows: map[string]string{
			"u-traveler": `[{"id":"pu-t","role":"client","agent_id":null,"client_id":"c-1","account":{"locked_at":null}}]`,
			"u-agent":    `[{"id":"pu-a","role":"agent","agent_id":"a-1","client_id":null,"account":{"locked_at":null}}]`,
			"u-locked":   `[{"id":"pu-l","role":"client","agent_id":null,"client_id":"c-2","account":{"locked_at":"2026-11-01T00:00:00Z"}}]`,
		},
	}
}

// whoami is a test port: it answers with the resolved caller, so the gate and RequireUser are
// both visible in one reply.
func whoami(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	second := ""
	if c.SecondFactorAt != nil {
		second = js.ISOString(*c.SecondFactorAt)
	}
	ip := ""
	if c.IP != nil {
		ip = *c.IP
	}
	return edge.OK(js.O("pu", c.PlatformUserID, "role", c.Role, "aal", c.AAL, "second", second, "ip", ip,
		"inProcess", edge.InProcess(r.Context()), "formKey", r.Header.Get("X-Sta-Form-Key")))
}

func boom(*edge.Deps, *http.Request) (*edge.Reply, error) {
	return nil, errFake
}

var errFake = &fakeErr{}

type fakeErr struct{}

func (*fakeErr) Error() string { return "lookup failed: secret row value jordan@example.com" }

func portedRegistry(t *testing.T, fake *fakeSupabase, logs *bytes.Buffer) *Registry {
	t.Helper()
	srv := httptest.NewServer(fake)
	t.Cleanup(srv.Close)
	return newRegistry(Config{
		SupabaseURL: srv.URL, AnonKey: "anon", ServiceRoleKey: "service-key", CronSecret: "cron-secret-0123456789abcdef0123",
		LeadFormKey: "lead-key", Getenv: func(string) string { return "" },
	}, nil, slog.New(slog.NewJSONHandler(logs, nil)), map[string]port{
		"agent-trip-notes": {GateUser, whoami},
		"lead-message":     {GateOpen, whoami},
		"push-dispatch":    {GateCron, func(*edge.Deps, *http.Request) (*edge.Reply, error) { return edge.OK(js.O("ran", true)) }},
		"cruise-search": {GateInProcess, func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
			return edge.OK(js.O("inProcess", edge.InProcess(r.Context())))
		}},
		"agent-report": {GateUser, boom},
	})
}

func post(g *Registry, name, token, body string, header ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "/functions/v1/"+name, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	return serve(g, req)
}

func TestUserGateRefusesBeforeHandlerCode(t *testing.T) {
	fake := newFake()
	g := portedRegistry(t, fake, &bytes.Buffer{})
	cases := []struct {
		name, token, auth string
		status            int
		detail            string
	}{
		{"no header", "", "", 401, "Missing bearer token."},
		{"not bearer", "", "Basic abc", 401, "Missing bearer token."},
		{"bad token", "nope", "", 401, "Invalid or expired token."},
		{"no platform user", orphanToken, "", 403, "This account has no platform user."},
		{"locked", lockedToken, "", 403, "This account is on hold."},
	}
	for _, c := range cases {
		var rec *httptest.ResponseRecorder
		if c.auth != "" {
			rec = post(g, "agent-trip-notes", "", `{}`, "Authorization", c.auth)
		} else {
			rec = post(g, "agent-trip-notes", c.token, `{}`)
		}
		want := `{"type":"about:blank","title":"` + http.StatusText(c.status) + `","status":` + itoa(c.status) + `,"detail":"` + c.detail + `"}`
		if rec.Code != c.status || rec.Body.String() != want {
			t.Errorf("%s: %d %s, want %d %s", c.name, rec.Code, rec.Body, c.status, want)
		}
		if rec.Header().Get("Content-Type") != "application/problem+json" || rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
			t.Errorf("%s: headers %v", c.name, rec.Header())
		}
	}
	// A wrong method with no token is the gate's 401, as the gateway answered before Deno
	// ran; with a good token it is the function's own 400.
	req := httptest.NewRequest("GET", "/functions/v1/agent-trip-notes", nil)
	if rec := serve(g, req); rec.Code != 401 {
		t.Errorf("GET without a token = %d", rec.Code)
	}
	req = httptest.NewRequest("GET", "/functions/v1/agent-trip-notes", nil)
	req.Header.Set("Authorization", "Bearer "+travelerToken)
	if rec := serve(g, req); rec.Code != 400 || !strings.Contains(rec.Body.String(), "Use POST.") {
		t.Errorf("GET with a token = %d %s", rec.Code, rec.Body)
	}
}

func TestRequireUserReadsClaimsAfterGoTrue(t *testing.T) {
	g := portedRegistry(t, newFake(), &bytes.Buffer{})
	rec := post(g, "agent-trip-notes", agentToken, `{}`, "Cf-Connecting-Ip", "203.0.113.9")
	want := `{"pu":"pu-a","role":"agent","aal":"aal2","second":"2023-11-14T22:15:00.000Z","ip":"203.0.113.9","inProcess":false,"formKey":""}`
	if rec.Code != 200 || rec.Body.String() != want {
		t.Errorf("got %d %s\nwant %s", rec.Code, rec.Body, want)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Errorf("content-type %q", rec.Header().Get("Content-Type"))
	}
	rec = post(g, "agent-trip-notes", travelerToken, `{}`)
	if !strings.Contains(rec.Body.String(), `"aal":"aal1","second":""`) {
		t.Errorf("traveler: %s", rec.Body)
	}
}

// A client-sent x-sta-* header never reaches a ported function; lead-message gets the trusted
// form key from the registry, as it did through the pass-through.
func TestTrustedHeadersAreRebuiltForPortedFunctions(t *testing.T) {
	g := portedRegistry(t, newFake(), &bytes.Buffer{})
	rec := post(g, "lead-message", travelerToken, `{}`, "X-Sta-Form-Key", "forged", "Cf-Connecting-Ip", "198.51.100.7")
	if !strings.Contains(rec.Body.String(), `"formKey":"lead-key"`) {
		t.Errorf("lead-message: %s", rec.Body)
	}
	rec = post(g, "agent-trip-notes", travelerToken, `{}`, "X-Sta-Form-Key", "forged")
	if !strings.Contains(rec.Body.String(), `"formKey":""`) {
		t.Errorf("a forged x-sta header reached a function: %s", rec.Body)
	}
}

func TestCronGateIsTheSecretAlone(t *testing.T) {
	fake := newFake()
	g := portedRegistry(t, fake, &bytes.Buffer{})
	if rec := post(g, "push-dispatch", "", `{}`); rec.Code != 401 {
		t.Errorf("no token = %d", rec.Code)
	}
	if rec := post(g, "push-dispatch", "service-key", `{}`); rec.Code != 403 {
		t.Errorf("the service key must not open a cron route = %d", rec.Code)
	}
	if rec := post(g, "push-dispatch", agentToken, `{}`); rec.Code != 403 {
		t.Errorf("a user token = %d", rec.Code)
	}
	if rec := post(g, "push-dispatch", "cron-secret-0123456789abcdef0123", `{}`); rec.Code != 200 {
		t.Errorf("the cron secret = %d %s", rec.Code, rec.Body)
	}
	for _, s := range fake.seen {
		if strings.HasPrefix(s, "GET /auth") {
			t.Errorf("a cron route asked GoTrue: %v", fake.seen)
		}
	}
}

func TestInProcessFunctionsAreNotOnTheDoor(t *testing.T) {
	g := portedRegistry(t, newFake(), &bytes.Buffer{})
	if rec := post(g, "cruise-search", "anon", `{}`); rec.Code != 404 {
		t.Errorf("door = %d", rec.Code)
	}
	r := g.Call(context.Background(), "cruise-search", "anon", Input{Method: "POST", Body: map[string]any{}})
	if !r.OK || string(r.Data) != `{"inProcess":true}` {
		t.Errorf("Call = %+v %s", r, r.Data)
	}
}

func TestCallRunsPortedFunctionsInProcess(t *testing.T) {
	fake := newFake()
	g := portedRegistry(t, fake, &bytes.Buffer{})
	r := g.Call(context.Background(), "agent-trip-notes", agentToken, Input{Method: "POST", Body: map[string]any{}, Visitor: "192.0.2.1"})
	if !r.OK || !strings.Contains(string(r.Data), `"ip":"192.0.2.1","inProcess":true`) {
		t.Errorf("Call = %+v %s", r, r.Data)
	}
	if r := g.Call(context.Background(), "agent-trip-notes", "bad", Input{Method: "POST", Body: map[string]any{}}); r.Kind != Unauthenticated {
		t.Errorf("bad token = %+v", r)
	}
	if r := g.Call(context.Background(), "agent-trip-notes", agentToken, Input{Method: "GET"}); r.Kind != Rejected || r.Detail != "Use POST." {
		t.Errorf("rejected = %+v", r)
	}
	for _, s := range fake.seen {
		if strings.Contains(s, "/functions/v1/") {
			t.Errorf("a ported function went over HTTP: %v", fake.seen)
		}
	}
}

// A 500 has no detail, and its log line carries the label, never the rest of the message.
func TestUnhandledErrorIsABare500(t *testing.T) {
	var logs bytes.Buffer
	g := portedRegistry(t, newFake(), &logs)
	rec := post(g, "agent-report", travelerToken, `{}`)
	if rec.Code != 500 || rec.Body.String() != `{"type":"about:blank","title":"Internal Server Error","status":500}` {
		t.Errorf("got %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(logs.String(), "jordan@example.com") || !strings.Contains(logs.String(), `"error":"lookup failed"`) {
		t.Errorf("log = %s", logs.String())
	}
}

func TestPreflightIsAnswered(t *testing.T) {
	g := portedRegistry(t, newFake(), &bytes.Buffer{})
	rec := serve(g, httptest.NewRequest("OPTIONS", "/functions/v1/agent-trip-notes", nil))
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Methods") != "GET, POST, PATCH, DELETE, OPTIONS" {
		t.Errorf("preflight = %d %v", rec.Code, rec.Header())
	}
}

// Without the service key nothing runs in Go: every name passes through, as in Phase 1.
func TestNoServiceKeyMeansPassThrough(t *testing.T) {
	srv, s := upstream(t, 200, `{"from":"deno"}`, nil)
	g := newRegistry(Config{SupabaseURL: srv.URL, AnonKey: "anon"}, nil, slog.New(slog.NewJSONHandler(io.Discard, nil)),
		map[string]port{"agent-trip-notes": {GateUser, whoami}})
	rec := post(g, "agent-trip-notes", travelerToken, `{}`)
	if rec.Body.String() != `{"from":"deno"}` || s.path != "/functions/v1/agent-trip-notes" {
		t.Errorf("got %s via %s", rec.Body, s.path)
	}
}

// The port table names only real functions, with the gate their Deno original had.
func TestPortTableGates(t *testing.T) {
	open := map[string]bool{"lead-message": true, "email-unsubscribe": true}
	cron := map[string]bool{"push-dispatch": true, "email-dispatch": true, "email-inbox": true, "cruise-sync": true}
	known := map[string]bool{}
	for _, f := range Functions {
		known[f] = true
	}
	for name, p := range portTable() {
		want := GateUser
		switch {
		case open[name]:
			want = GateOpen
		case cron[name]:
			want = GateCron
		case webOnly[name]:
			want = GateInProcess
		}
		if !known[name] || p.gate != want || p.fn == nil {
			t.Errorf("%s: known=%v gate=%d want %d", name, known[name], p.gate, want)
		}
	}
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }
