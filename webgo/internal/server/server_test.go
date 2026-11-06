package server

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// noOutbound fails the test if anything makes an HTTP call through the default transport
// while the handler runs. Phase 1 routes must never call out.
type noOutbound struct{ t *testing.T }

func (n noOutbound) RoundTrip(r *http.Request) (*http.Response, error) {
	n.t.Errorf("unexpected outbound request to %s", r.URL)
	return nil, errors.New("outbound calls are not allowed in this test")
}

func newHandler(t *testing.T, env config.Env) (http.Handler, *bytes.Buffer) {
	t.Helper()
	old := http.DefaultTransport
	http.DefaultTransport = noOutbound{t}
	t.Cleanup(func() { http.DefaultTransport = old })

	cfg := config.Config{Env: env, Port: "8080", SiteURL: "http://localhost:8080"}
	var logs bytes.Buffer
	h, err := New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(&logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return h, &logs
}

func do(h http.Handler, method, target string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func checkSecurityHeaders(t *testing.T, rec *httptest.ResponseRecorder, production bool) {
	t.Helper()
	h := rec.Header()
	if h.Get("Content-Security-Policy") != CSP {
		t.Errorf("CSP = %q", h.Get("Content-Security-Policy"))
	}
	for k, want := range map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"Referrer-Policy":        "strict-origin-when-cross-origin",
	} {
		if got := h.Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	if hsts := h.Get("Strict-Transport-Security"); (hsts != "") != production {
		t.Errorf("Strict-Transport-Security = %q in production=%v", hsts, production)
	}
}

func TestHealthz(t *testing.T) {
	h, _ := newHandler(t, config.Production)
	rec := do(h, http.MethodGet, "/healthz", nil)
	if rec.Code != http.StatusOK || rec.Body.String() != "ok\n" {
		t.Errorf("GET /healthz = %d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("healthz should not be cached")
	}
	checkSecurityHeaders(t, rec, true)

	if rec := do(h, http.MethodHead, "/healthz", nil); rec.Code != http.StatusOK {
		t.Errorf("HEAD /healthz = %d", rec.Code)
	}
}

func TestUnknownPathsAre404WithNoOutboundCall(t *testing.T) {
	h, _ := newHandler(t, config.Production)
	for _, path := range []string{"/", "/wp-login.php", "/.env", "/agent", "/dashboard", "/login", "/_demo"} {
		rec := do(h, http.MethodGet, path, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, rec.Code)
		}
		if rec.Body.String() != "Not found\n" {
			t.Errorf("GET %s body = %q", path, rec.Body.String())
		}
		checkSecurityHeaders(t, rec, true)
	}
}

// The demo page exists only in development; production must not serve it.
func TestDemoIsDevelopmentOnly(t *testing.T) {
	prod, _ := newHandler(t, config.Production)
	if rec := do(prod, http.MethodGet, "/_demo", nil); rec.Code != http.StatusNotFound {
		t.Errorf("production GET /_demo = %d, want 404", rec.Code)
	}

	dev, _ := newHandler(t, config.Development)
	rec := do(dev, http.MethodGet, "/_demo", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("development GET /_demo = %d: %s", rec.Code, rec.Body.String())
	}
	checkSecurityHeaders(t, rec, false)
	body := rec.Body.String()

	for _, want := range []string{
		"<!DOCTYPE html>",
		"<title>Page builder demo</title>",
		">Aruba in April</h1>",
		"&lt;script&gt;alert(&#34;this must show as text&#34;)&lt;/script&gt;",
		"&lt;/textarea&gt;&lt;b&gt;this must stay inside the box&lt;/b&gt;</textarea>",
		`href="https://pay.example.com/milestone/123"`,
		`href="/trips/aruba/stops/eagle-beach"`,
		`aria-disabled="true"`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("demo page lacks %q\n%s", want, body)
		}
	}
	for _, bad := range []string{"<script>", "javascript:", "Sample", "#sample", "No stops yet."} {
		if strings.Contains(body, bad) {
			t.Errorf("demo page carries %q\n%s", bad, body)
		}
	}
}

// http.CrossOriginProtection refuses a state-changing request from another site before any
// route runs (the job Next's server actions did for us).
func TestCrossOriginWritesAreRefused(t *testing.T) {
	h, _ := newHandler(t, config.Development)
	rec := do(h, http.MethodPost, "/_demo", map[string]string{"Sec-Fetch-Site": "cross-site"})
	if rec.Code != http.StatusForbidden {
		t.Errorf("cross-site POST = %d, want 403", rec.Code)
	}
	checkSecurityHeaders(t, rec, false)

	rec = do(h, http.MethodPost, "/anything", map[string]string{"Origin": "https://evil.example", "Host": "example.com"})
	if rec.Code != http.StatusForbidden {
		t.Errorf("POST with a foreign Origin = %d, want 403", rec.Code)
	}

	rec = do(h, http.MethodPost, "/anything", map[string]string{"Sec-Fetch-Site": "same-origin"})
	if rec.Code != http.StatusNotFound {
		t.Errorf("same-origin POST to an unknown path = %d, want 404", rec.Code)
	}
}

func TestRequestLogCarriesNoQueryOrSecrets(t *testing.T) {
	h, logs := newHandler(t, config.Production)
	do(h, http.MethodGet, "/healthz?email=ada@example.com&token=abc123", map[string]string{
		"Cookie":        "sb-x-auth-token=secret-cookie",
		"Authorization": "Bearer secret-bearer",
	})
	line := logs.String()
	if !strings.Contains(line, `"path":"/healthz"`) || !strings.Contains(line, `"status":200`) {
		t.Errorf("log line missing path or status: %s", line)
	}
	for _, leak := range []string{"ada@example.com", "abc123", "secret-cookie", "secret-bearer", "email="} {
		if strings.Contains(line, leak) {
			t.Errorf("log line leaks %q: %s", leak, line)
		}
	}
}

func TestPanicsBecomeA500WithHeaders(t *testing.T) {
	var logs bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&logs, nil))
	boom := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })
	h := logRequests(recoverPanics(securityHeaders(boom, false), log), log)

	rec := do(h, http.MethodGet, "/x", nil)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if body, _ := io.ReadAll(rec.Body); strings.Contains(string(body), "boom") {
		t.Errorf("panic text reached the visitor: %s", body)
	}
	if !strings.Contains(logs.String(), `"status":500`) {
		t.Errorf("the request log did not record the 500: %s", logs.String())
	}
	// The panic's message can carry request data, so only its type and the stack are logged.
	if strings.Contains(logs.String(), "boom") {
		t.Errorf("the panic message reached the log: %s", logs.String())
	}
	if !strings.Contains(logs.String(), `"panic_type":"string"`) || !strings.Contains(logs.String(), `"stack"`) {
		t.Errorf("the log lacks the panic type or stack: %s", logs.String())
	}
}
