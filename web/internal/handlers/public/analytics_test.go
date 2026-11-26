package public_test

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/server"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/pages"
)

// serverWithAnalytics builds the whole server with a GA measurement id set.
func serverWithAnalytics(t *testing.T, id string) http.Handler {
	t.Helper()
	cfg := config.Config{Env: config.Production, Port: "8080", SiteURL: "https://app.story-tail.com",
		AnalyticsMeasurementID: id}
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func body(t *testing.T, h http.Handler, path string) string {
	t.Helper()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s = %d", path, w.Code)
	}
	return w.Body.String()
}

// With no measurement id nothing is loaded and nothing is asked of the visitor, which is what
// the Next app renders with no Firebase config.
func TestAnalyticsIsAbsentUntilItIsConfigured(t *testing.T) {
	h, _ := publicServer(t, config.Production)
	out := body(t, h, "/how-it-works")
	for _, bad := range []string{"data-analytics", "data-measurement-id", `aria-label="Google Analytics"`} {
		if strings.Contains(out, bad) {
			t.Errorf("an unconfigured server shipped %q", bad)
		}
	}
}

// Configured, the page carries the id and the page it may report, and nothing else about the
// visit. The banner ships hidden: the answer lives in localStorage, which the server cannot
// read, so the module reveals it (that is also why the page stays cacheable).
func TestAnalyticsShipsTheRedactedPage(t *testing.T) {
	h := serverWithAnalytics(t, "G-TEST123")
	out := body(t, h, "/how-it-works")
	for _, want := range []string{
		`data-measurement-id="G-TEST123"`,
		`data-page="https://app.story-tail.com/how-it-works"`,
		`aria-label="Google Analytics"`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("missing %s", want)
		}
	}
	if !strings.Contains(out, `data-slot="consent"`) || !strings.Contains(out, "hidden") {
		t.Error("the consent banner should ship hidden")
	}
}

// The only thing Google is ever told is a page's URL, so what the visitor typed must not be
// in it. This is the same contract content/public/legal/privacy.ts describes.
func TestAnalyticsNeverCarriesTheVisitorsQuery(t *testing.T) {
	h := serverWithAnalytics(t, "G-TEST123")
	out := body(t, h, "/explore?email=someone%40example.com&dest=Nassau&utm_source=ig")
	for _, leaked := range []string{"someone@example.com", "someone%40example.com", "Nassau"} {
		if strings.Contains(out, leaked) {
			t.Errorf("the page carries %q where Google can read it", leaked)
		}
	}
	if !strings.Contains(out, `data-page="https://app.story-tail.com/explore?utm_source=ig"`) {
		t.Error("the campaign should survive and the rest should not")
	}
}

// A cached page must be the same bytes for everybody, so analytics may not make it personal.
func TestAnalyticsLeavesPublicPagesCacheable(t *testing.T) {
	h := serverWithAnalytics(t, "G-TEST123")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/how-it-works", nil))
	if got := w.Header().Get("Cache-Control"); got != web.PublicCacheControl {
		t.Errorf("Cache-Control %q, want %q", got, web.PublicCacheControl)
	}
	if c := w.Header().Values("Set-Cookie"); len(c) > 0 {
		t.Errorf("analytics set a cookie: %v", c)
	}
}

// The policy names Google's own hosts and nothing else; everything else stays 'self'.
func TestCSPAllowsGoogleAnalyticsAndNothingElse(t *testing.T) {
	h := serverWithAnalytics(t, "G-TEST123")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/how-it-works", nil))
	csp := w.Header().Get("Content-Security-Policy")
	for _, want := range []string{
		"script-src 'self' https://www.googletagmanager.com;",
		"https://*.google-analytics.com",
		"https://*.analytics.google.com",
		"default-src 'self';",
		"style-src 'self';",
		"object-src 'none';",
		"base-uri 'none';",
		"frame-ancestors 'none'",
	} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP missing %q: %s", want, csp)
		}
	}
	for _, bad := range []string{"'unsafe-inline'", "'unsafe-eval'", "script-src 'self' *", "https://firebase"} {
		if strings.Contains(csp, bad) {
			t.Errorf("CSP carries %q: %s", bad, csp)
		}
	}
}
