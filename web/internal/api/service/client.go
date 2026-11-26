// Package service is the SERVICE-ROLE client: PostgREST, RPC, Storage and the GoTrue admin
// API, called with the service-role key, which bypasses RLS entirely. It ports
// supabase/functions/_shared/db.ts's serviceClient() and makes the same HTTP calls
// supabase-js made (docs/GO-MIGRATION.md ruling 11): no direct Postgres connection, no
// pooler, no new database role.
//
// ONLY packages under internal/api may import this one (ruling 14). boundary_test.go in
// internal/api fails the build otherwise. Page handlers read with the visitor's own token
// through internal/supa, so RLS still guards them; the key in this package is the one secret
// that must never reach a page, a log or a reply.
//
// On the service role RLS checks nothing, so every ownership test a function makes is
// explicit, in SQL or in Go, never inherited. Every call site that reaches for this client
// is doing something the caller's own permissions cannot.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is safe for concurrent use.
type Client struct {
	base string // SUPABASE_URL, no trailing slash
	key  string
	http *http.Client
}

// New returns a service client. A nil hc gets one with a 30-second timeout. Either way it
// never follows a redirect, which would copy the service key to whatever host a Location
// header names.
func New(baseURL, serviceRoleKey string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: 30 * time.Second}
	}
	hc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{base: strings.TrimRight(baseURL, "/"), key: serviceRoleKey, http: hc}
}

// BaseURL is the project URL the client talks to (no key in it).
func (c *Client) BaseURL() string { return c.base }

// Error is a failed call, shaped like supabase-js's error object. Message is what
// `error.message` held, which the Deno functions put into their thrown Error (and so into the
// function log, never into a reply). Details and Hint are kept for code that branches on
// them, and are never part of Error(): PostgREST's details can quote a row's values.
type Error struct {
	Status  int
	Code    string
	Message string
	Details string
	Hint    string
}

func (e *Error) Error() string { return e.Message }

// maxBody bounds what any reply may be read into memory.
const maxBody = 32 << 20

// do sends one request and returns the status, the headers and the body. A non-2xx becomes
// *Error built from the body the way supabase-js builds it.
func (c *Client) do(ctx context.Context, method, url string, body io.Reader, header http.Header) (int, http.Header, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return 0, nil, nil, err
	}
	for k, v := range header {
		req.Header[k] = v
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	resp, err := c.http.Do(req)
	if err != nil {
		// supabase-js answered a network failure with { message: "TypeError: fetch failed" }-ish
		// text; nothing keys off it. Never include the URL: it can hold filter values.
		return 0, nil, nil, &Error{Message: "fetch failed: " + method + " " + pathOnly(url)}
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return resp.StatusCode, resp.Header, nil, &Error{Status: resp.StatusCode, Message: "reading the reply failed"}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return resp.StatusCode, resp.Header, raw, nil
	}
	return resp.StatusCode, resp.Header, raw, errorFrom(resp.StatusCode, raw)
}

// errorFrom reads a PostgREST, Storage or GoTrue error body.
func errorFrom(status int, raw []byte) *Error {
	var b struct {
		Code             json.RawMessage `json:"code"`
		ErrorCode        string          `json:"error_code"`
		Message          *string         `json:"message"`
		Msg              *string         `json:"msg"`
		ErrorDescription *string         `json:"error_description"`
		Error            *string         `json:"error"`
		Details          *string         `json:"details"`
		Hint             *string         `json:"hint"`
		StatusCode       string          `json:"statusCode"`
	}
	e := &Error{Status: status}
	if json.Unmarshal(raw, &b) != nil {
		e.Message = string(raw)
		return e
	}
	// PostgREST's code is a string; GoTrue's is a number with error_code beside it.
	var code string
	if json.Unmarshal(b.Code, &code) == nil {
		e.Code = code
	} else if b.ErrorCode != "" {
		e.Code = b.ErrorCode
	}
	for _, m := range []*string{b.Message, b.Msg, b.ErrorDescription, b.Error} {
		if m != nil && *m != "" {
			e.Message = *m
			break
		}
	}
	if b.Details != nil {
		e.Details = *b.Details
	}
	if b.Hint != nil {
		e.Hint = *b.Hint
	}
	return e
}

func pathOnly(u string) string {
	if i := strings.IndexByte(u, '?'); i >= 0 {
		u = u[:i]
	}
	return strings.TrimPrefix(u, "http")
}

// marshal encodes a request body. Bodies are built with js.O or structs, so encoding/json's
// HTML escaping is harmless here (PostgREST decodes it); replies are what must match bytes.
func marshal(v any) ([]byte, error) {
	if raw, ok := v.(json.RawMessage); ok {
		return raw, nil
	}
	return json.Marshal(v)
}

// decode reads a reply body into out, which must be a pointer to a typed value. A nil out
// discards the body.
func decode(raw []byte, out any) error {
	if out == nil || len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return &Error{Message: fmt.Sprintf("decoding the reply: %v", err)}
	}
	return nil
}
