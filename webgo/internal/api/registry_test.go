package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The list must match supabase/functions/, so a new function can't be forgotten here and a
// deleted one can't linger.
func TestFunctionsMatchTheRepo(t *testing.T) {
	entries, err := os.ReadDir(filepath.Join("..", "..", "..", "supabase", "functions"))
	if err != nil {
		t.Fatal(err)
	}
	var onDisk []string
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), "_") {
			onDisk = append(onDisk, e.Name())
		}
	}
	listed := slices.Sorted(slices.Values(Functions))
	if !slices.Equal(listed, onDisk) {
		t.Errorf("Functions drifted from supabase/functions/:\n listed %v\n on disk %v", listed, onDisk)
	}
}

type upstreamSeen struct {
	method, path, query, body string
	header                    http.Header
}

func upstream(t *testing.T, status int, reply string, replyHeaders map[string]string) (*httptest.Server, *upstreamSeen) {
	t.Helper()
	s := &upstreamSeen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*s = upstreamSeen{r.Method, r.URL.Path, r.URL.RawQuery, string(b), r.Header.Clone()}
		for k, v := range replyHeaders {
			w.Header().Set(k, v)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(srv.Close)
	return srv, s
}

func registry(url string, logs *bytes.Buffer) *Registry {
	return New(Config{SupabaseURL: url, AnonKey: "anon", LeadFormKey: "lead-key", SearchToken: "search-token"},
		nil, slog.New(slog.NewJSONHandler(logs, nil)))
}

func serve(g *Registry, req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.Handle("/functions/v1/{name}", g)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestPassThroughIsByteForByte(t *testing.T) {
	srv, s := upstream(t, 422, `{"type":"about:blank","title":"Unprocessable","status":422,"detail":"That date is in the past."}`,
		map[string]string{"Content-Type": "application/problem+json", "Set-Cookie": "x=1", "X-Internal": "no"})
	var logs bytes.Buffer
	req := httptest.NewRequest("POST", "/functions/v1/trip-message?x=1", strings.NewReader(`{"op":"send","body":"secret words"}`))
	req.Header.Set("Authorization", "Bearer user-token")
	req.Header.Set("apikey", "anon")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "sta-session=should-not-travel")
	req.Header.Set("X-Sta-Client-Ip", "6.6.6.6") // forged by the caller
	req.Header.Set("X-Sta-Form-Key", "guess")
	rec := serve(registry(srv.URL, &logs), req)

	if s.method != "POST" || s.path != "/functions/v1/trip-message" || s.query != "x=1" || s.body != `{"op":"send","body":"secret words"}` {
		t.Errorf("upstream saw %s %s?%s %s", s.method, s.path, s.query, s.body)
	}
	if s.header.Get("Authorization") != "Bearer user-token" || s.header.Get("Apikey") != "anon" {
		t.Errorf("auth headers not forwarded: %v", s.header)
	}
	for _, k := range []string{"Cookie", "X-Sta-Client-Ip", "X-Sta-Form-Key"} {
		if s.header.Get(k) != "" {
			t.Errorf("%s travelled to Supabase", k)
		}
	}
	if rec.Code != 422 || rec.Body.String() != `{"type":"about:blank","title":"Unprocessable","status":422,"detail":"That date is in the past."}` {
		t.Errorf("reply = %d %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "application/problem+json" || rec.Header().Get("Set-Cookie") != "" || rec.Header().Get("X-Internal") != "" {
		t.Errorf("reply headers = %v", rec.Header())
	}
	if strings.Contains(logs.String(), "secret words") || !strings.Contains(logs.String(), `"function":"trip-message"`) {
		t.Errorf("log line: %s", logs.String())
	}
}

func TestLeadMessageGetsTheTrustedVisitorAddress(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	req := httptest.NewRequest("POST", "/functions/v1/lead-message", strings.NewReader(`{}`))
	req.Header.Set("Cf-Connecting-Ip", "203.0.113.9")
	req.Header.Set("X-Sta-Client-Ip", "6.6.6.6")
	serve(registry(srv.URL, &bytes.Buffer{}), req)
	if s.header.Get("X-Sta-Client-Ip") != "203.0.113.9" || s.header.Get("X-Sta-Form-Key") != "lead-key" {
		t.Errorf("lead headers = ip %q key %q", s.header.Get("X-Sta-Client-Ip"), s.header.Get("X-Sta-Form-Key"))
	}
}

func TestOtherFunctionsGetNoTrustedHeaders(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	req := httptest.NewRequest("POST", "/functions/v1/agent-trip", strings.NewReader(`{}`))
	req.Header.Set("Cf-Connecting-Ip", "203.0.113.9")
	serve(registry(srv.URL, &bytes.Buffer{}), req)
	for _, k := range []string{"X-Sta-Client-Ip", "X-Sta-Form-Key", "X-Sta-Search-Token"} {
		if s.header.Get(k) != "" {
			t.Errorf("agent-trip received %s", k)
		}
	}
}

func TestUnknownNamesAndMethods(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	g := registry(srv.URL, &bytes.Buffer{})
	for _, path := range []string{"/functions/v1/not-a-function", "/functions/v1/_shared"} {
		if rec := serve(g, httptest.NewRequest("GET", path, nil)); rec.Code != 404 {
			t.Errorf("GET %s = %d, want 404", path, rec.Code)
		}
	}
	// ServeMux cleans dot segments with a redirect before the registry runs; what matters is
	// that it never becomes a request to Supabase (checked below).
	if rec := serve(g, httptest.NewRequest("GET", "/functions/v1/../../auth/v1/admin/users", nil)); rec.Code == 200 {
		t.Errorf("a dot-segment path succeeded: %d", rec.Code)
	}
	if rec := serve(g, httptest.NewRequest("DELETE", "/functions/v1/agent-trip", nil)); rec.Code != 405 {
		t.Errorf("DELETE = %d, want 405", rec.Code)
	}
	if s.method != "" {
		t.Errorf("an unknown name or method reached Supabase: %s %s", s.method, s.path)
	}
}

func TestUnreachableIs502WithoutDetail(t *testing.T) {
	g := registry("http://127.0.0.1:1", &bytes.Buffer{})
	rec := serve(g, httptest.NewRequest("POST", "/functions/v1/agent-trip", strings.NewReader(`{}`)))
	if rec.Code != 502 {
		t.Fatalf("status = %d", rec.Code)
	}
	var p map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if _, has := p["detail"]; has || p["status"] != float64(502) {
		t.Errorf("body = %s", rec.Body.String())
	}
}

func TestOversizedBodyIsRefused(t *testing.T) {
	srv, _ := upstream(t, 200, `{}`, nil)
	big := strings.Repeat("x", maxRequestBody+1)
	rec := serve(registry(srv.URL, &bytes.Buffer{}), httptest.NewRequest("POST", "/functions/v1/agent-trip", strings.NewReader(big)))
	if rec.Code != http.StatusRequestEntityTooLarge && rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestCallMapsEdgeCallResult(t *testing.T) {
	cases := []struct {
		status   int
		reply    string
		ok       bool
		kind     Kind
		detail   string
		conflict bool
	}{
		{200, `{"trip_id":"t1","total_cents":123456789012}`, true, 0, "", false},
		{204, ``, true, 0, "", false},
		{401, `{}`, false, Unauthenticated, "", false},
		{403, `{"detail":"Finish signing in."}`, false, Unauthenticated, "", false},
		{422, `{"detail":"That date is in the past."}`, false, Rejected, "That date is in the past.", false},
		{409, `{"detail":"This trip moved since you opened it."}`, false, Rejected, "This trip moved since you opened it.", true},
		{400, `not json`, false, Rejected, "", false},
		{500, `{"detail":"never shown"}`, false, Unavailable, "", false},
	}
	for _, c := range cases {
		srv, s := upstream(t, c.status, c.reply, nil)
		r := registry(srv.URL, &bytes.Buffer{}).Call(context.Background(), "agent-trip-status", "tok",
			Input{Method: "POST", Body: map[string]any{"op": "set"}})
		if r.OK != c.ok || r.Kind != c.kind || r.Detail != c.detail || r.Conflict != c.conflict {
			t.Errorf("%d: %+v", c.status, r)
		}
		if s.header.Get("Authorization") != "Bearer tok" || s.header.Get("Apikey") != "anon" || s.body != `{"op":"set"}` {
			t.Errorf("%d: upstream saw %v %s", c.status, s.header, s.body)
		}
	}
}

// Money stays int64: Data is raw JSON for typed decoding, not a map[string]any.
func TestCallKeepsCentsExact(t *testing.T) {
	srv, _ := upstream(t, 200, `{"total_cents":9007199254740993}`, nil)
	r := registry(srv.URL, &bytes.Buffer{}).Call(context.Background(), "agent-trip", "tok", Input{Method: "GET", Query: url.Values{"id": {"1"}}})
	var out struct {
		TotalCents int64 `json:"total_cents"`
	}
	if err := json.Unmarshal(r.Data, &out); err != nil || out.TotalCents != 9007199254740993 {
		t.Errorf("total_cents = %d (%v); a float64 would read 9007199254740992", out.TotalCents, err)
	}
}

func TestCallRefusesWithoutAToken(t *testing.T) {
	r := registry("http://127.0.0.1:1", &bytes.Buffer{}).Call(context.Background(), "agent-trip", "", Input{Method: "GET"})
	if r.Kind != Unauthenticated {
		t.Errorf("kind = %v", r.Kind)
	}
	r = registry("http://127.0.0.1:1", &bytes.Buffer{}).Call(context.Background(), "../auth/v1/admin", "tok", Input{Method: "GET"})
	if r.Kind != Unavailable {
		t.Errorf("an unknown name was called: %+v", r)
	}
}
