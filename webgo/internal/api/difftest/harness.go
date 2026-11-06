//go:build difftest

// Package difftest is the differential test of docs/GO-MIGRATION.md §5.9: the same request
// goes to a Deno Edge Function and to its Go port, on the same local Supabase stack, and the
// two must agree on the status, the reply body, the rows written and the audit_event rows.
//
// It never runs in CI (build tag difftest): it needs a local stack and `supabase functions
// serve`. Run it as webgo/internal/api/difftest/README.md says.
//
// Each case runs in two WORLDS built the same way with different ids: world A is sent to
// Deno, world B to Go. Replies and rows are compared after each world's own ids are replaced
// by labels (the agent, the traveler, the trip...), and ids or timestamps minted during the
// request by placeholders.
package difftest

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Test-only values, shared with the env file `supabase functions serve` was started with.
// They protect nothing: the stack is a local, isolated copy.
const (
	SearchToken = "difftest-search-token-not-a-secret"
	LeadFormKey = "difftest-lead-form-key-not-a-secret"
	CronSecret  = "difftest-cron-secret-0123456789abcdef"
	Password    = "difftest-Password-1!"
)

// GoEnv is what the Go side's Getenv answers: the same values functions.env gave Deno.
var GoEnv = map[string]string{
	"ALLOWED_ORIGIN":            "http://localhost:3000",
	"HOTEL_SEARCH_CALLER_TOKEN": SearchToken,
	"LEAD_FORM_KEY":             LeadFormKey,
}

// Extra are functions under test that have not joined the port table yet. A test file
// registers its function in an init(): Extra["lead-message"] = api.Port{Gate: api.GateOpen,
// Fn: leadmessage.Func}.
var Extra = map[string]api.Port{}

// Stack is the local Supabase and the Go server under test.
type Stack struct {
	URL, Anon, Service string
	DB                 *service.Client
	Reg                *api.Registry
	Go                 *httptest.Server
	hc                 *http.Client
}

// S is the stack every test uses, built in TestMain.
var S *Stack

// Setup builds the stack from STA_DIFF_URL, STA_DIFF_ANON_KEY and STA_DIFF_SERVICE_KEY. It
// returns false when they are unset (then every test is skipped).
func Setup() bool {
	url, anon, svc := os.Getenv("STA_DIFF_URL"), os.Getenv("STA_DIFF_ANON_KEY"), os.Getenv("STA_DIFF_SERVICE_KEY")
	if url == "" || anon == "" || svc == "" {
		fmt.Println("difftest: STA_DIFF_URL, STA_DIFF_ANON_KEY and STA_DIFF_SERVICE_KEY are unset; skipping")
		return false
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if os.Getenv("STA_DIFF_LOG") != "" {
		log = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}
	reg := api.NewWithPorts(api.Config{
		SupabaseURL: url, AnonKey: anon, ServiceRoleKey: svc, CronSecret: CronSecret,
		LeadFormKey: LeadFormKey, SearchToken: SearchToken,
		Getenv: func(k string) string { return GoEnv[k] },
	}, nil, log, Extra)
	mux := http.NewServeMux()
	mux.Handle("/functions/v1/{name}", reg)
	srv := httptest.NewServer(mux)
	S = &Stack{URL: url, Anon: anon, Service: svc, DB: service.New(url, svc, nil), Reg: reg, Go: srv,
		hc: &http.Client{Timeout: 60 * time.Second}}
	return true
}

// Resp is one reply.
type Resp struct {
	Status int
	Body   string
	Header http.Header
}

func (s *Stack) send(base, method, name, query, body string, h http.Header) Resp {
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	u := base + "/functions/v1/" + name
	if query != "" {
		u += "?" + query
	}
	req, err := http.NewRequest(method, u, rd)
	if err != nil {
		panic(err)
	}
	for k, v := range h {
		req.Header[k] = v
	}
	if req.Header.Get("apikey") == "" {
		req.Header.Set("apikey", s.Anon)
	}
	if body != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := s.hc.Do(req)
	if err != nil {
		return Resp{Status: 0, Body: err.Error()}
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return Resp{Status: resp.StatusCode, Body: string(b), Header: resp.Header}
}

// Deno sends a request to the Edge Function through the local gateway.
func (s *Stack) Deno(method, name, query, body string, h http.Header) Resp {
	return s.send(s.URL, method, name, query, body, h)
}

// GoDoor sends the same request to the Go registry's HTTP door.
func (s *Stack) GoDoor(method, name, query, body string, h http.Header) Resp {
	return s.send(s.Go.URL, method, name, query, body, h)
}

// GoCall runs a function the way a web page does, in process.
func (s *Stack) GoCall(name, token string, in api.Input) api.Result {
	return s.Reg.Call(context.Background(), name, token, in)
}

// Bearer is an Authorization header.
func Bearer(token string) http.Header {
	return http.Header{"Authorization": {"Bearer " + token}}
}

// ---- fixtures ----

// Actor is a signed-in person in a world.
type Actor struct {
	Email          string
	UserID         string // auth.users.id == account.id
	PlatformUserID string
	ClientID       string
	AgentID        string
	Token          string // access token; aal2 for an agent
}

var seq atomic.Int64

// Unique returns a short tag no other fixture in this run uses.
func Unique() string {
	return fmt.Sprintf("%d%03d", time.Now().UnixMilli()%100000000, seq.Add(1)%1000)
}

// auth calls GoTrue.
func (s *Stack) auth(t *testing.T, method, path, token string, body any, out any) int {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, s.URL+path, rd)
	req.Header.Set("apikey", s.Anon)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.hc.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		t.Fatalf("%s %s = %d %s", method, path, resp.StatusCode, raw)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
	}
	return resp.StatusCode
}

func (s *Stack) signIn(t *testing.T, email string) string {
	t.Helper()
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	s.auth(t, "POST", "/auth/v1/token?grant_type=password", "", map[string]string{"email": email, "password": Password}, &tok)
	return tok.AccessToken
}

// createUser makes an auth user; handle_new_user() gives it an account, a client row and a
// client platform_user, owned by agentID (which must be active then) or by the one active
// agent.
func (s *Stack) createUser(t *testing.T, email, first, last, agentID string) *Actor {
	t.Helper()
	meta := map[string]any{"first_name": first, "last_name": last}
	if agentID != "" {
		meta["agent_id"] = agentID
	}
	var u struct {
		ID string `json:"id"`
	}
	req, _ := http.NewRequest("POST", s.URL+"/auth/v1/admin/users", jsonBody(map[string]any{
		"email": email, "password": Password, "email_confirm": true, "user_metadata": meta,
	}))
	req.Header.Set("apikey", s.Service)
	req.Header.Set("Authorization", "Bearer "+s.Service)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.hc.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 300 || json.Unmarshal(raw, &u) != nil {
		t.Fatalf("create user %s = %d %s", email, resp.StatusCode, raw)
	}
	a := &Actor{Email: email, UserID: u.ID}
	var pu []struct {
		ID       string  `json:"id"`
		ClientID *string `json:"client_id"`
	}
	if err := s.DB.From("platform_user").Select("id, client_id").Eq("account_id", u.ID).Rows(context.Background(), &pu); err != nil || len(pu) != 1 {
		t.Fatalf("platform_user for %s: %v %v", email, pu, err)
	}
	a.PlatformUserID = pu[0].ID
	if pu[0].ClientID != nil {
		a.ClientID = *pu[0].ClientID
	}
	t.Cleanup(func() { s.deleteUser(u.ID) })
	return a
}

func (s *Stack) deleteUser(id string) {
	req, _ := http.NewRequest("DELETE", s.URL+"/auth/v1/admin/users/"+id, nil)
	req.Header.Set("apikey", s.Service)
	req.Header.Set("Authorization", "Bearer "+s.Service)
	if resp, err := s.hc.Do(req); err == nil {
		resp.Body.Close()
	}
}

func jsonBody(v any) io.Reader { b, _ := json.Marshal(v); return bytes.NewReader(b) }

// NewAgent makes an advisor: an agent row (inactive, so the seed advisor stays the one
// active advisor that sign-ups and leads route to; requireAgentId lets inactive through),
// its platform_user turned into the agent's, and a session at aal2 through a real TOTP
// factor.
func (s *Stack) NewAgent(t *testing.T, tag string) *Actor {
	t.Helper()
	ctx := context.Background()
	agentID := uuid.New()
	email := "difftest-agent-" + tag + "@example.com"
	if err := s.DB.From("agent").Insert(ctx, js.O("id", agentID, "display_name", "Diff Agent "+tag,
		"email", email, "status", "active"), nil); err != nil {
		t.Fatalf("agent: %v", err)
	}
	a := s.createUser(t, email, "Diff", "Agent", agentID)
	orphan := a.ClientID
	if err := s.DB.From("platform_user").Eq("id", a.PlatformUserID).Update(ctx,
		js.O("role", "agent", "agent_id", agentID, "client_id", nil), nil); err != nil {
		t.Fatalf("platform_user to agent: %v", err)
	}
	if err := s.DB.From("agent").Eq("id", agentID).Update(ctx, js.O("status", "inactive"), nil); err != nil {
		t.Fatalf("agent inactive: %v", err)
	}
	_ = s.DB.From("client").Eq("id", orphan).Delete(ctx, nil)
	a.ClientID = ""
	a.AgentID = agentID
	a.Token = s.mfa(t, s.signIn(t, email))
	t.Cleanup(func() {
		_ = s.DB.From("agent").Eq("id", agentID).Update(context.Background(), js.O("status", "archived"), nil)
	})
	return a
}

// NewTraveler makes a traveler owned by agent (an *Actor from NewAgent), signed in at aal1.
func (s *Stack) NewTraveler(t *testing.T, tag string, agent *Actor) *Actor {
	t.Helper()
	ctx := context.Background()
	// The trigger only routes a sign-up to an ACTIVE advisor, so the agent is active for
	// the moment of the insert.
	_ = s.DB.From("agent").Eq("id", agent.AgentID).Update(ctx, js.O("status", "active"), nil)
	a := s.createUser(t, "difftest-traveler-"+tag+"@example.com", "Diff", "Traveler "+tag, agent.AgentID)
	_ = s.DB.From("agent").Eq("id", agent.AgentID).Update(ctx, js.O("status", "inactive"), nil)
	a.Token = s.signIn(t, a.Email)
	return a
}

// mfa enrolls a TOTP factor and verifies it, returning the aal2 access token.
func (s *Stack) mfa(t *testing.T, token string) string {
	t.Helper()
	var f struct {
		ID   string `json:"id"`
		TOTP struct {
			Secret string `json:"secret"`
		} `json:"totp"`
	}
	s.auth(t, "POST", "/auth/v1/factors", token, map[string]string{"factor_type": "totp", "friendly_name": "difftest"}, &f)
	var ch struct {
		ID string `json:"id"`
	}
	s.auth(t, "POST", "/auth/v1/factors/"+f.ID+"/challenge", token, map[string]string{}, &ch)
	var out struct {
		AccessToken string `json:"access_token"`
	}
	s.auth(t, "POST", "/auth/v1/factors/"+f.ID+"/verify", token, map[string]string{"challenge_id": ch.ID, "code": totp(f.TOTP.Secret, time.Now())}, &out)
	return out.AccessToken
}

// totp is RFC 6238 with GoTrue's defaults: SHA-1, 30 seconds, 6 digits.
func totp(secret string, at time.Time) string {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(strings.TrimRight(secret, "=")))
	if err != nil {
		panic(err)
	}
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(at.Unix()/30))
	m := hmac.New(sha1.New, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	code := (binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff) % 1000000
	return fmt.Sprintf("%06d", code)
}

// ---- worlds and normalisation ----

// World is one copy of a case's fixtures. Label every id the reply or the rows may carry,
// so the comparison can tell "the same trip in each world" from a real difference.
type World struct {
	Name     string // "deno" or "go"
	Tag      string
	Agent    *Actor
	Traveler *Actor
	ids      map[string]string // id -> label
	Vars     map[string]string // anything a case wants to keep per world
}

// ID records a label for an id in this world, and returns the id.
func (w *World) ID(label, id string) string {
	if w.ids == nil {
		w.ids = map[string]string{}
	}
	w.ids[id] = label
	return id
}

// NewWorlds makes the Deno world and the Go world: an agent and a traveler of theirs each.
func NewWorlds(t *testing.T) (deno, goW *World) {
	t.Helper()
	mk := func(name string) *World {
		tag := Unique()
		w := &World{Name: name, Tag: tag, Vars: map[string]string{}}
		w.Agent = S.NewAgent(t, tag)
		w.Traveler = S.NewTraveler(t, tag, w.Agent)
		w.label(w.Agent, "agent")
		w.label(w.Traveler, "traveler")
		w.ID("tag", tag)
		return w
	}
	return mk("deno"), mk("go")
}

func (w *World) label(a *Actor, who string) {
	w.ID(who+".user", a.UserID)
	w.ID(who+".pu", a.PlatformUserID)
	if a.ClientID != "" {
		w.ID(who+".client", a.ClientID)
	}
	if a.AgentID != "" {
		w.ID(who+".agent", a.AgentID)
	}
	w.ID(who+".email", a.Email)
}

var (
	uuidRe = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	tsRe   = regexp.MustCompile(`\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?`)
	tokRe  = regexp.MustCompile(`token=[A-Za-z0-9._-]+`)
)

// Normalize replaces this world's ids by their labels (longest first), then any other uuid by
// <uuid>, timestamps by <ts> and signed-URL tokens by <token>.
func (w *World) Normalize(s string) string {
	ids := make([]string, 0, len(w.ids))
	for id := range w.ids {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return len(ids[i]) > len(ids[j]) })
	for _, id := range ids {
		s = strings.ReplaceAll(s, id, "<"+w.ids[id]+">")
	}
	s = uuidRe.ReplaceAllString(s, "<uuid>")
	s = tsRe.ReplaceAllString(s, "<ts>")
	return tokRe.ReplaceAllString(s, "token=<token>")
}

// ---- rows ----

// Rows reads a table as raw JSON text (never decoded into any: the cents stay as written).
func (s *Stack) Rows(t *testing.T, q *service.Query) string {
	t.Helper()
	var raw json.RawMessage
	if err := q.Rows(context.Background(), &raw); err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	return string(raw)
}

// Since is a v7 lower bound for rows minted at or after at.
func Since(at time.Time) string {
	ms := at.Add(-time.Second).UnixMilli() // a second of slack for clock skew with the container
	return fmt.Sprintf("%08x-%04x-7000-8000-000000000000", uint32(ms>>16), uint16(ms))
}

// Audit is the audit_event rows world w's actors wrote since the mark, oldest first,
// without the id and created_at (both differ by construction).
func (s *Stack) Audit(t *testing.T, w *World, mark string) string {
	t.Helper()
	actors := []string{w.Agent.PlatformUserID, w.Traveler.PlatformUserID}
	return s.Rows(t, s.DB.From("audit_event").
		Select("actor_role,event_type,target_entity,target_id,metadata,user_agent").
		In("actor_user_id", actors).Gte("id", mark).Order("id", true))
}

// ---- the comparison ----

// Case is one request, sent to both worlds.
type Case struct {
	Name   string
	Fn     string
	Method string // POST when empty
	// Via is "door" (the HTTP door, default) or "call" (in process, as a web page calls).
	Via string
	// Setup prepares this case's fixtures in one world (fresh ids every time).
	Setup func(t *testing.T, w *World)
	// Token is the caller's bearer token; the world's agent when nil. Return "" for none.
	Token func(w *World) string
	// Header adds request headers.
	Header func(w *World) http.Header
	Query  func(w *World) string
	Body   func(w *World) string
	// Snap returns rows to compare after the request (already Normalized is not needed).
	Snap func(t *testing.T, w *World) string
	// SkipAudit leaves the audit rows out of the comparison (cron functions, which write
	// system rows with no actor; compare those in Snap).
	SkipAudit bool
	// Expect, when set, also pins the status both sides must give, so a case that was
	// written to reach a branch proves it reached it.
	Expect int
}

// Run sends each case to Deno (world A) and Go (world B) and compares everything.
func Run(t *testing.T, deno, goW *World, cases []Case) {
	t.Helper()
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			a := runOne(t, c, deno, true)
			b := runOne(t, c, goW, false)
			if a.status != b.status {
				t.Errorf("status: deno %d, go %d\n deno body %s\n go body   %s", a.status, b.status, a.body, b.body)
			}
			if c.Expect != 0 && a.status != c.Expect {
				t.Errorf("status %d, the case expects %d (body %s)", a.status, c.Expect, a.body)
			}
			if a.body != b.body {
				t.Errorf("body:\n deno %s\n go   %s", a.body, b.body)
			}
			if a.snap != b.snap {
				t.Errorf("rows:\n deno %s\n go   %s", a.snap, b.snap)
			}
			if a.audit != b.audit {
				t.Errorf("audit:\n deno %s\n go   %s", a.audit, b.audit)
			}
		})
	}
}

type outcome struct {
	status                 int
	body, snap, audit, raw string
}

func runOne(t *testing.T, c Case, w *World, deno bool) outcome {
	t.Helper()
	if !deno && !S.Reg.Ported(c.Fn) {
		// Without this the Go door would pass the request through to the same Deno function
		// and every comparison would trivially agree.
		t.Fatalf("%s is not ported in this run: register it in Extra or portTable", c.Fn)
	}
	if c.Setup != nil {
		c.Setup(t, w)
	}
	method := c.Method
	if method == "" {
		method = "POST"
	}
	token := w.Agent.Token
	if c.Token != nil {
		token = c.Token(w)
	}
	h := http.Header{}
	if token != "" {
		h.Set("Authorization", "Bearer "+token)
	}
	h.Set("User-Agent", "difftest/1")
	if c.Header != nil {
		for k, v := range c.Header(w) {
			h[k] = v
		}
	}
	query, body := "", ""
	if c.Query != nil {
		query = c.Query(w)
	}
	if c.Body != nil {
		body = c.Body(w)
	}
	mark := Since(time.Now())
	var r Resp
	switch {
	case deno:
		r = S.Deno(method, c.Fn, query, body, h)
		if c.Via == "call" {
			r = callShape(r)
		}
	case c.Via == "call":
		r = callAsResp(c.Fn, token, method, query, body)
	default:
		r = S.GoDoor(method, c.Fn, query, body, h)
	}
	o := outcome{status: r.Status, raw: r.Body, body: w.Normalize(r.Body)}
	if c.Snap != nil {
		o.snap = w.Normalize(c.Snap(t, w))
	}
	if !c.SkipAudit {
		o.audit = w.Normalize(S.Audit(t, w, mark))
	}
	return o
}

// callAsResp runs a Call and shapes it like a door reply, for an in-process function. The
// body of a refusal is rebuilt from the Result (Call keeps only the detail).
func callAsResp(name, token, method, query, body string) Resp {
	in := api.Input{Method: method}
	if body != "" {
		in.Body = json.RawMessage(body)
	}
	if query != "" {
		in.Query, _ = parseQuery(query)
	}
	r := S.GoCall(name, token, in)
	if r.OK {
		return Resp{Status: r.Status, Body: string(r.Data)}
	}
	return Resp{Status: r.Status, Body: "detail:" + r.Detail}
}

// callShape reduces a door reply to what a Call keeps: the body on success, the detail on
// a refusal, and nothing but the status on a 401 or 403 (Call sends the visitor to sign in
// and keeps no sentence).
func callShape(r Resp) Resp {
	if r.Status >= 200 && r.Status < 300 {
		return r
	}
	if r.Status == http.StatusUnauthorized || r.Status == http.StatusForbidden {
		return Resp{Status: r.Status, Body: "detail:"}
	}
	var p struct {
		Detail string `json:"detail"`
	}
	_ = json.Unmarshal([]byte(r.Body), &p)
	return Resp{Status: r.Status, Body: "detail:" + p.Detail}
}

func parseQuery(q string) (url.Values, error) { return url.ParseQuery(q) }
