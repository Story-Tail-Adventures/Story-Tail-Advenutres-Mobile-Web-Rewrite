// Package api is the backend door: the registry behind /functions/v1/{name}, which mobile
// calls over HTTP and the web pages call in process (docs/GO-MIGRATION.md §5.2).
//
// Phase 1 ports nothing yet, so every known name passes through to the Supabase Edge
// Function of the same name, with the caller's own Authorization and body unchanged. As
// functions are ported (Track B), the registry runs the Go handler instead and nothing that
// calls it changes. This package is the only one that will ever hold the service-role key
// (ruling 14); in Phase 1 it holds none.
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
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
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
}

// Config is what the registry needs from config.Config.
type Config struct {
	SupabaseURL, AnonKey, LeadFormKey, SearchToken string
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
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	hc.CheckRedirect = noRedirects
	known := make(map[string]bool, len(Functions))
	for _, f := range Functions {
		known[f] = true
	}
	return &Registry{
		supabaseURL: strings.TrimRight(c.SupabaseURL, "/"),
		anonKey:     c.AnonKey,
		leadFormKey: c.LeadFormKey,
		searchToken: c.SearchToken,
		client:      hc,
		known:       known,
		log:         log,
	}
}

// visitorHeaders tells the function who the visitor is. Through Go, Supabase's own edge sees
// this server as the caller, so without these every call would look like it came from here.
//
//   - X-Forwarded-For carries the visitor's address into _shared/auth.ts (ctx.ip, the IP on
//     audit_event rows). Informational, as it was when mobile called Supabase directly.
//   - lead-message rate-limits per visitor and trusts x-sta-client-ip only beside the form
//     key. Without it every lead would share this server's one bucket.
//
// Both rely on clientaddr, which trusts cf-connecting-ip. Before any production traffic the
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
	if !g.known[name] || webOnly[name] {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet, http.MethodPost, http.MethodOptions:
	default:
		w.Header().Set("Allow", "GET, POST, OPTIONS")
		problem(w, http.StatusMethodNotAllowed)
		return
	}
	if g.supabaseURL == "" {
		problem(w, http.StatusServiceUnavailable) // development with no Supabase configured
		return
	}

	target := g.supabaseURL + "/functions/v1/" + name
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	out, err := http.NewRequestWithContext(r.Context(), r.Method, target, http.MaxBytesReader(w, r.Body, maxRequestBody))
	if err != nil {
		problem(w, http.StatusBadRequest)
		return
	}
	for _, k := range forwardRequest {
		if v := r.Header.Values(k); len(v) > 0 {
			out.Header[http.CanonicalHeaderKey(k)] = v
		}
	}
	visitor, _ := clientaddr.From(r.Header)
	g.visitorHeaders(out.Header, name, visitor) // never the search token: see webOnly

	start := time.Now()
	resp, err := g.client.Do(out)
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			problem(w, http.StatusRequestEntityTooLarge)
			return
		}
		// Never log the body or the error's URL with a query string in it.
		g.log.Warn("function unreachable", "function", name, "ms", time.Since(start).Milliseconds())
		problem(w, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.ContentLength > maxResponseBody {
		g.log.Warn("function reply too large", "function", name, "bytes", resp.ContentLength)
		problem(w, http.StatusBadGateway)
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

// problem writes the RFC 7807 shape the Edge Functions use (_shared/problem.ts) with no
// detail, as their 5xx replies have none. Mobile reads only `detail`, so it treats these as
// "try again", which is right for a gateway failure.
func problem(w http.ResponseWriter, status int) {
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
}

// Input is one in-process call.
type Input struct {
	Method  string     // GET or POST
	Query   url.Values // GET only
	Body    any        // POST only, marshalled to JSON
	Visitor string     // the browser's address (clientaddr), for the functions that read it
}

// Call runs a function for a web page, with the visitor's own access token. While the
// function is not ported it goes over HTTP to Supabase; after, it will run in process.
// Either way the page sees the same Result.
func (g *Registry) Call(ctx context.Context, name, accessToken string, in Input) Result {
	if !g.known[name] {
		return Result{Kind: Unavailable} // a programming error; never a URL built from input
	}
	if accessToken == "" {
		return Result{Kind: Unauthenticated}
	}
	if g.supabaseURL == "" {
		return Result{Kind: Unavailable}
	}
	target := g.supabaseURL + "/functions/v1/" + name
	var body io.Reader
	switch in.Method {
	case http.MethodGet:
		if len(in.Query) > 0 {
			target += "?" + in.Query.Encode()
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
	req, err := http.NewRequestWithContext(ctx, in.Method, target, body)
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

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		if len(raw) == 0 {
			raw = []byte("{}")
		}
		return Result{OK: true, Data: raw}
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return Result{Kind: Unauthenticated}
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		var p struct {
			Detail *string `json:"detail"`
		}
		detail := ""
		if json.Unmarshal(raw, &p) == nil && p.Detail != nil {
			detail = *p.Detail
		}
		return Result{Kind: Rejected, Detail: detail, Conflict: resp.StatusCode == http.StatusConflict}
	default:
		g.log.Warn("function failed", "function", name, "status", resp.StatusCode)
		return Result{Kind: Unavailable}
	}
}
