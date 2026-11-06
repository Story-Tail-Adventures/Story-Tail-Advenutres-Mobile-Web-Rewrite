package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// Review hard fail (#178): the HTTP door used to add the search token to anyone's call, which
// opened the metered SerpApi budget to the internet. The search functions are web-only.
func TestSearchFunctionsAreNotOnTheHTTPDoor(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	g := registry(srv.URL, &bytes.Buffer{})
	for _, name := range []string{"hotel-search", "cruise-search"} {
		for _, method := range []string{"GET", "POST"} {
			if rec := serve(g, httptest.NewRequest(method, "/functions/v1/"+name, strings.NewReader(`{}`))); rec.Code != 404 {
				t.Errorf("%s %s = %d, want 404", method, name, rec.Code)
			}
		}
	}
	if s.method != "" {
		t.Errorf("a web-only function was reached through the door: %s %s", s.method, s.path)
	}
}

func TestTheDoorNeverSendsTheSearchToken(t *testing.T) {
	for _, name := range Functions {
		if webOnly[name] {
			continue
		}
		srv, s := upstream(t, 200, `{}`, nil)
		serve(registry(srv.URL, &bytes.Buffer{}), httptest.NewRequest("POST", "/functions/v1/"+name, strings.NewReader(`{}`)))
		if s.header.Get("X-Sta-Search-Token") != "" {
			t.Errorf("%s received the search token through the door", name)
		}
	}
}

// Web pages still get the token, in process.
func TestCallAddsTheSearchTokenInProcessOnly(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	registry(srv.URL, &bytes.Buffer{}).Call(context.Background(), "cruise-search", "tok", Input{Method: "POST", Body: map[string]any{}})
	if s.header.Get("X-Sta-Search-Token") != "search-token" {
		t.Errorf("in-process cruise-search lacked the token: %v", s.header)
	}
}

// The functions read x-forwarded-for for the audit IP; through Go they would otherwise see
// this server for every caller.
func TestVisitorAddressIsForwarded(t *testing.T) {
	srv, s := upstream(t, 200, `{}`, nil)
	req := httptest.NewRequest("POST", "/functions/v1/agent-message", strings.NewReader(`{}`))
	req.Header.Set("Cf-Connecting-Ip", "203.0.113.9")
	req.Header.Set("X-Forwarded-For", "6.6.6.6, 10.0.0.1") // the caller's own claim is replaced
	serve(registry(srv.URL, &bytes.Buffer{}), req)
	if got := s.header.Get("X-Forwarded-For"); got != "203.0.113.9" {
		t.Errorf("X-Forwarded-For = %q", got)
	}

	srv2, s2 := upstream(t, 200, `{}`, nil)
	registry(srv2.URL, &bytes.Buffer{}).Call(context.Background(), "agent-message", "tok", Input{Method: "POST", Body: map[string]any{}, Visitor: "198.51.100.4"})
	if got := s2.header.Get("X-Forwarded-For"); got != "198.51.100.4" {
		t.Errorf("Call X-Forwarded-For = %q", got)
	}
}

// Following a redirect would copy the bearer token and any trusted header to another host.
func TestRedirectsAreNotFollowed(t *testing.T) {
	evilHit := false
	evil := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { evilHit = true }))
	t.Cleanup(evil.Close)
	srv, _ := upstream(t, 303, ``, map[string]string{"Location": evil.URL + "/steal"})

	req := httptest.NewRequest("POST", "/functions/v1/lead-message", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("Cf-Connecting-Ip", "203.0.113.9")
	rec := serve(registry(srv.URL, &bytes.Buffer{}), req)
	if evilHit {
		t.Fatal("the registry followed a redirect to another host")
	}
	if rec.Code != 303 || rec.Header().Get("Location") != "" {
		t.Errorf("redirect reply = %d Location=%q (Location is not forwarded)", rec.Code, rec.Header().Get("Location"))
	}

	r := registry(srv.URL, &bytes.Buffer{}).Call(context.Background(), "agent-trip", "tok", Input{Method: "GET"})
	if evilHit || r.OK {
		t.Errorf("Call followed a redirect: %+v", r)
	}
}

func TestOversizedReplyIsRefusedBeforeTheStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(maxResponseBody+1))
		w.WriteHeader(200)
	}))
	t.Cleanup(srv.Close)
	rec := serve(registry(srv.URL, &bytes.Buffer{}), httptest.NewRequest("GET", "/functions/v1/agent-report", nil))
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}
