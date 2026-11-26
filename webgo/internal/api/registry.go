// Package api is the backend door: the registry behind /functions/v1/{name}, which mobile
// and pg_cron call over HTTP and the web pages call in process (docs/GO-MIGRATION.md §5.2).
//
// A name in the port table (ported.go) runs its Go handler, behind the gate its Deno
// original had: a user route's bearer token is accepted by GoTrue before any handler code
// runs (Go has no Supabase gateway doing verify_jwt), a cron route needs STA_CRON_SECRET,
// and the two open routes check their own form key or signed link. Any other known name
// still passes through to the Supabase Edge Function of the same name, with the caller's
// own Authorization and body unchanged. Callers never see the difference.
//
// This package tree is the only one that holds the service-role key (ruling 14):
// internal/api/service is imported nowhere else (boundary_test.go).
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Functions lists every Edge Function by name. A name outside it is a 404, so the registry
// can never be used to reach any other path on the Supabase host. functions_test.go checks
// it against supabase/functions/, so a new function cannot be forgotten here.
var Functions = []string{
	"account-admin",
	"agent-client", "agent-client-notes", "agent-commission", "agent-itinerary", "agent-lead",
	"agent-message", "agent-message-template", "agent-report", "agent-settings", "agent-template",
	"agent-trip", "agent-trip-notes", "agent-trip-status",
	"commission-import",
	"cruise-search", "cruise-sync",
	"email-dispatch", "email-inbox", "email-unsubscribe",
	"hotel-search",
	"lead-message",
	"onboarding-companions", "onboarding-connect", "onboarding-preferences", "onboarding-profile", "onboarding-step",
	"push-device", "push-dispatch",
	"quote-request",
	"testimonial",
	"trip-document", "trip-document-url", "trip-message",
}

const (
	maxRequestBody  = 5 << 20 // function bodies are JSON; files go to Storage by signed URL
	maxResponseBody = 10 << 20
)

// Requests carry only these headers on to Supabase. Never Cookie, never x-sta-*: the
// registry adds the x-sta-* headers it is trusted to send, and a client cannot forge them.
var forwardRequest = []string{
	"Authorization", "Apikey", "Content-Type", "Accept", "Accept-Language", "X-Client-Info",
	"User-Agent", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers",
}

// Replies carry only these headers back.
var forwardResponse = []string{
	"Content-Type", "Retry-After", "Cache-Control", "Vary",
	"Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods",
	"Access-Control-Max-Age",
}

// Registry serves /functions/v1/{name}. Safe for concurrent use.
type Registry struct {
	supabaseURL string
	anonKey     string
	// leadFormKey and searchToken are the shared secrets the web server already held, so
	// lead-message can trust the visitor's address and cruise-search knows the caller is
	// ours. Both go away when those functions run in process (§5.9).
	leadFormKey string
	searchToken string
	client      *http.Client
	known       map[string]bool
	log         *slog.Logger

	// ports are the functions that run in Go. Empty when there is no service-role key
	// (development only: production refuses to start without it), so everything passes
	// through as in Phase 1.
	ports      map[string]portEntry
	deps       *edge.Deps
	cronSecret string
}

// Config is what the registry needs from config.Config.
type Config struct {
	SupabaseURL, AnonKey, LeadFormKey, SearchToken string
	// ServiceRoleKey is SUPABASE_SERVICE_ROLE_KEY. Without it no function runs in Go.
	ServiceRoleKey string
	// CronSecret is STA_CRON_SECRET, the bearer the pg_cron ticks send (ruling 13).
	CronSecret string
	// Getenv reads the integration secrets the ported functions need at request time
	// (EMAIL_*, VAPID_*, FCM_*, TRACK_CRUISES_*, ALLOWED_ORIGIN, ...). Nil means os.Getenv.
	Getenv func(string) string
}

// Gate is what must be true before a ported function's code runs.
type Gate int

const (
	// GateUser: verify_jwt = true. GoTrue accepts the bearer token first.
	GateUser Gate = iota + 1
	// GateOpen: verify_jwt = false (lead-message, email-unsubscribe). Their own checks.
	GateOpen
	// GateCron: a pg_cron tick, STA_CRON_SECRET in constant time, nothing else accepted.
	GateCron
	// GateInProcess: web-only. 404 on the HTTP door; reachable through Call alone.
	GateInProcess
)

// port is one row of the port table.
type port struct {
	gate Gate
	fn   edge.Func
}

// Port is a port-table row given from outside the package: the differential tests register
// the function under test with it before the function joins portTable.
type Port struct {
	Gate Gate
	Fn   edge.Func
}

// NewWithPorts is New with extra rows laid over the port table. Only the difftest harness
// uses it; the server always calls New.
func NewWithPorts(c Config, hc *http.Client, log *slog.Logger, extra map[string]Port) *Registry {
	table := portTable()
	for name, p := range extra {
		table[name] = port{gate: p.Gate, fn: p.Fn}
	}
	return newRegistry(c, hc, log, table)
}

type portEntry struct {
	gate Gate
	h    http.Handler
}

// webOnly are functions the HTTP door refuses (404). Only the web server calls them, in
// process, with a token it holds; mobile never does. Passing them through would hand that
// token to anyone on the internet: hotel-search spends a metered SerpApi budget.
var webOnly = map[string]bool{"hotel-search": true, "cruise-search": true}

// noRedirects stops the client following a redirect, which would copy our headers (the
// bearer token, a trusted x-sta-* value) to whatever host the Location names.
func noRedirects(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

// New builds the registry. A nil hc gets a client with a 60-second timeout. Either way the
// client never follows redirects.
func New(c Config, hc *http.Client, log *slog.Logger) *Registry {
	return newRegistry(c, hc, log, portTable())
}

func newRegistry(c Config, hc *http.Client, log *slog.Logger, table map[string]port) *Registry {
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	hc.CheckRedirect = noRedirects
	known := make(map[string]bool, len(Functions))
	for _, f := range Functions {
		known[f] = true
	}
	g := &Registry{
		supabaseURL: strings.TrimRight(c.SupabaseURL, "/"),
		anonKey:     c.AnonKey,
		leadFormKey: c.LeadFormKey,
		searchToken: c.SearchToken,
		client:      hc,
		known:       known,
		log:         log,
		ports:       map[string]portEntry{},
		cronSecret:  c.CronSecret,
	}
	if g.supabaseURL == "" || c.ServiceRoleKey == "" {
		if len(table) > 0 {
			log.Warn("no SUPABASE_SERVICE_ROLE_KEY: every function passes through to Supabase")
		}
		return g
	}
	getenv := c.Getenv
	if getenv == nil {
		getenv = os.Getenv
	}
	g.deps = &edge.Deps{
		DB:            service.New(g.supabaseURL, c.ServiceRoleKey, nil),
		Auth:          supa.New(g.supabaseURL, c.AnonKey, nil),
		Log:           log,
		Now:           time.Now,
		Env:           getenv,
		AllowedOrigin: getenv("ALLOWED_ORIGIN"),
	}
	for name, p := range table {
		if !known[name] {
			panic("api: ported function " + name + " is not in Functions")
		}
		g.ports[name] = portEntry{gate: p.gate, h: edge.Serve(g.deps, name, p.fn)}
	}
	return g
}

// Ported reports whether name runs in Go.
func (g *Registry) Ported(name string) bool { _, ok := g.ports[name]; return ok }

// visitorHeaders tells the function who the visitor is. Through Go, Supabase's own edge sees
// this server as the caller, so without these every call would look like it came from here.
//
//   - X-Forwarded-For carries the visitor's address into _shared/auth.ts (ctx.ip, the IP on
//     audit_event rows). Informational, as it was when mobile called Supabase directly.
//   - lead-message rate-limits per visitor and trusts x-sta-client-ip only beside the form
//     key. Without it every lead would share this server's one bucket.
//
// Both rely on clientaddr (through edge.VisitorAddress, which also requires a real IP), which trusts cf-connecting-ip. Before any production traffic the
// origin must only be reachable through Cloudflare, or a caller who reaches it directly can
// forge that header and rotate lead buckets (docs/GO-MIGRATION.md §6, the forged-header test).
func (g *Registry) visitorHeaders(h http.Header, name, visitor string) {
	if visitor == "" {
		return
	}
	h.Set("X-Forwarded-For", visitor)
	if name == "lead-message" && g.leadFormKey != "" {
		h.Set("X-Sta-Form-Key", g.leadFormKey)
		h.Set("X-Sta-Client-Ip", visitor)
	}
}

// ServeHTTP passes one call through to the Supabase function. Mount it on
// "/functions/v1/{name}" as a public route: it carries its own bearer token, never a cookie.
func (g *Registry) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !g.known[name] {
		http.NotFound(w, r)
		return
	}
	if p, ok := g.ports[name]; ok {
		if p.gate == GateInProcess {
			http.NotFound(w, r)
			return
		}
		g.serveLocal(w, r, name, p, false)
		return
	}
	if webOnly[name] {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet, http.MethodPost, http.MethodOptions:
	default:
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		gatewayProblem(w, http.StatusMethodNotAllowed)
		return
	}
	if g.supabaseURL == "" {
		gatewayProblem(w, http.StatusServiceUnavailable) // development with no Supabase configured
		return
	}

	target := g.supabaseURL + "/functions/v1/" + name
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	out, err := http.NewRequestWithContext(r.Context(), r.Method, target, http.MaxBytesReader(w, r.Body, maxRequestBody))
	if err != nil {
		gatewayProblem(w, http.StatusBadRequest)
		return
	}
	for _, k := range forwardRequest {
		if v := r.Header.Values(k); len(v) > 0 {
			out.Header[http.CanonicalHeaderKey(k)] = v
		}
	}
	visitor, _ := edge.VisitorAddress(r.Header) // an IP address or nothing (see VisitorAddress)
	g.visitorHeaders(out.Header, name, visitor) // never the search token: see webOnly

	start := time.Now()
	resp, err := g.client.Do(out)
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			gatewayProblem(w, http.StatusRequestEntityTooLarge)
			return
		}
		// Never log the body or the error's URL with a query string in it.
		g.log.Warn("function unreachable", "function", name, "ms", time.Since(start).Milliseconds())
		gatewayProblem(w, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.ContentLength > maxResponseBody {
		g.log.Warn("function reply too large", "function", name, "bytes", resp.ContentLength)
		gatewayProblem(w, http.StatusBadGateway)
		return
	}

	for _, k := range forwardResponse {
		if v := resp.Header.Values(k); len(v) > 0 {
			w.Header()[http.CanonicalHeaderKey(k)] = v
		}
	}
	w.WriteHeader(resp.StatusCode)
	n, _ := io.Copy(w, io.LimitReader(resp.Body, maxResponseBody))
	if n == maxResponseBody {
		// A reply with no length that ran past the limit; the status is already sent.
		g.log.Warn("function reply cut at the size limit", "function", name)
	}
	g.log.Info("function", "function", name, "method", r.Method, "status", resp.StatusCode,
		"bytes", n, "ms", time.Since(start).Milliseconds())
}

// gatewayProblem writes the RFC 7807 shape the Edge Functions use (_shared/problem.ts) with no
// detail, as their 5xx replies have none. Mobile reads only `detail`, so it treats these as
// "try again", which is right for a gateway failure.
func gatewayProblem(w http.ResponseWriter, status int) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status), "status": status,
	})
}

// Kind says why a call did not succeed.
type Kind int

const (
	// Unauthenticated: 401 or 403. Send the visitor to sign in.
	Unauthenticated Kind = iota + 1
	// Rejected: another 4xx; show Detail, the function's own sentence.
	Rejected
	// Unavailable: a network error or a 5xx; say "try again in a moment".
	Unavailable
)

// Result ports EdgeCallResult (web/lib/supabase/edge.ts). Data is the raw JSON reply:
// callers decode it into typed structs, never into any, so cents stay int64.
type Result struct {
	OK       bool
	Data     json.RawMessage
	Kind     Kind
	Detail   string
	Conflict bool // true only on a 409, the optimistic lock (read this, never match Detail's words)
	Status   int  // the function's HTTP status (0 when it was never reached)
}

// Input is one in-process call.
type Input struct {
	Method  string     // GET or POST
	Query   url.Values // GET only
	Body    any        // POST only, marshalled to JSON
	Visitor string     // the browser's address (clientaddr), for the functions that read it
}

// Call runs a function for a web page, with the visitor's own access token. A ported
// function runs in process, through the same gate and handler the HTTP door uses; an unported
// one goes over HTTP to Supabase. Either way the page sees the same Result.
func (g *Registry) Call(ctx context.Context, name, accessToken string, in Input) Result {
	if !g.known[name] {
		return Result{Kind: Unavailable} // a programming error; never a URL built from input
	}
	if accessToken == "" {
		return Result{Kind: Unauthenticated}
	}
	var body io.Reader
	var query string
	switch in.Method {
	case http.MethodGet:
		if len(in.Query) > 0 {
			query = "?" + in.Query.Encode()
		}
	case http.MethodPost:
		b, err := json.Marshal(in.Body)
		if err != nil {
			return Result{Kind: Unavailable}
		}
		body = bytes.NewReader(b)
	default:
		return Result{Kind: Unavailable}
	}

	if p, ok := g.ports[name]; ok {
		req, err := http.NewRequestWithContext(edge.WithInProcess(ctx), in.Method, "/functions/v1/"+name+query, body)
		if err != nil {
			return Result{Kind: Unavailable}
		}
		req.SetPathValue("name", name)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if in.Visitor != "" {
			req.Header.Set("X-Forwarded-For", in.Visitor)
		}
		rec := newRecorder()
		g.serveLocal(rec, req, name, p, true)
		return g.result(name, rec.status, rec.body.Bytes())
	}

	if g.supabaseURL == "" {
		return Result{Kind: Unavailable}
	}
	req, err := http.NewRequestWithContext(ctx, in.Method, g.supabaseURL+"/functions/v1/"+name+query, body)
	if err != nil {
		return Result{Kind: Unavailable}
	}
	req.Header.Set("apikey", g.anonKey)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	g.visitorHeaders(req.Header, name, in.Visitor)
	if webOnly[name] && g.searchToken != "" {
		req.Header.Set("X-Sta-Search-Token", g.searchToken) // in process only, never the HTTP door
	}

	resp, err := g.client.Do(req)
	if err != nil {
		g.log.Warn("function call failed", "function", name) // never the body
		return Result{Kind: Unavailable}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBody))
	return g.result(name, resp.StatusCode, raw)
}

// result maps a reply onto EdgeCallResult.
func (g *Registry) result(name string, status int, raw []byte) Result {
	r := g.kind(name, status, raw)
	r.Status = status
	return r
}

func (g *Registry) kind(name string, status int, raw []byte) Result {
	switch {
	case status >= 200 && status < 300:
		if len(raw) == 0 {
			raw = []byte("{}")
		}
		return Result{OK: true, Data: raw}
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return Result{Kind: Unauthenticated}
	case status >= 400 && status < 500:
		var p struct {
			Detail *string `json:"detail"`
		}
		detail := ""
		if json.Unmarshal(raw, &p) == nil && p.Detail != nil {
			detail = *p.Detail
		}
		return Result{Kind: Rejected, Detail: detail, Conflict: status == http.StatusConflict}
	default:
		g.log.Warn("function failed", "function", name, "status", status)
		return Result{Kind: Unavailable}
	}
}

// serveLocal runs a ported function behind its gate. inProcess is true for Call.
//
// The trusted headers are rebuilt exactly as the pass-through builds them: anything x-sta-*
// the caller sent is dropped, X-Forwarded-For becomes the visitor's address, and
// lead-message gets the form key beside it. So a ported function reads the same headers its
// Deno original read through the door.
func (g *Registry) serveLocal(w http.ResponseWriter, r *http.Request, name string, p portEntry, inProcess bool) {
	start := time.Now()
	if r.Method == http.MethodOptions {
		edge.Preflight(w, g.deps.AllowedOrigin)
		return
	}
	if r.Body != nil {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)
	}
	for k := range r.Header {
		if strings.HasPrefix(http.CanonicalHeaderKey(k), "X-Sta-") {
			r.Header.Del(k)
		}
	}
	// The one validated address replaces every address header the caller sent, so whatever
	// a function reads (clientaddr, lead's clientAddress, the audit IP) is this or nothing.
	visitor, _ := edge.VisitorAddress(r.Header)
	r.Header.Del("X-Forwarded-For")
	r.Header.Del("Cf-Connecting-Ip")
	g.visitorHeaders(r.Header, name, visitor)

	rec := &statusWriter{ResponseWriter: w}
	switch p.gate {
	case GateUser:
		verified, err := edge.Verify(g.deps, r)
		if err != nil {
			edge.WriteProblem(rec, g.log, name, g.deps.AllowedOrigin, err)
			break
		}
		p.h.ServeHTTP(rec, verified)
	case GateCron:
		if !edge.CronSecretOK(r, g.cronSecret) {
			err := problem.Forbidden("This function runs on the schedule, not for a caller.")
			if _, ok := r.Header["Authorization"]; !ok {
				err = problem.Unauthorized("Missing bearer token.")
			}
			edge.WriteProblem(rec, g.log, name, g.deps.AllowedOrigin, err)
			break
		}
		p.h.ServeHTTP(rec, r)
	case GateInProcess:
		if !inProcess {
			http.NotFound(rec, r)
			break
		}
		p.h.ServeHTTP(rec, r)
	default: // GateOpen
		p.h.ServeHTTP(rec, r)
	}
	g.log.Info("function", "function", name, "method", r.Method, "status", rec.code(),
		"ms", time.Since(start).Milliseconds(), "go", true)
}

// statusWriter remembers the status for the log line.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(b)
}

func (s *statusWriter) code() int {
	if s.status == 0 {
		return http.StatusOK
	}
	return s.status
}

// recorder is the in-process ResponseWriter for Call.
type recorder struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func newRecorder() *recorder { return &recorder{header: http.Header{}} }

func (r *recorder) Header() http.Header { return r.header }

func (r *recorder) WriteHeader(code int) {
	if r.status == 0 {
		r.status = code
	}
}

func (r *recorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	if r.body.Len()+len(b) > maxResponseBody {
		return 0, errors.New("reply too large")
	}
	return r.body.Write(b)
}
