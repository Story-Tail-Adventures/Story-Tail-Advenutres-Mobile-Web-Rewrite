package server

import (
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
)

var stylesheet = regexp.MustCompile(`<link rel="stylesheet" href="(/assets/css/site\.[0-9a-f]{10}\.css)"/?>`)

// The full stack: a page links its hashed stylesheet, and that URL serves with a year of
// immutable caching and the security headers; the plain name is a 404.
func TestAssetsThroughTheServer(t *testing.T) {
	h, _ := newHandler(t, config.Development)
	page := do(h, http.MethodGet, "/_styleguide/layout/public-plain", nil)
	if page.Code != http.StatusOK {
		t.Fatalf("layout preview = %d: %s", page.Code, page.Body.String())
	}
	m := stylesheet.FindStringSubmatch(page.Body.String())
	if m == nil {
		t.Fatalf("no hashed stylesheet link in:\n%s", page.Body.String()[:600])
	}
	css := do(h, http.MethodGet, m[1], nil)
	if css.Code != http.StatusOK {
		t.Fatalf("GET %s = %d", m[1], css.Code)
	}
	if got := css.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control = %q", got)
	}
	checkSecurityHeaders(t, css, false)
	if plain := do(h, http.MethodGet, "/assets/css/site.css", nil); plain.Code != http.StatusNotFound {
		t.Errorf("the unhashed name = %d, want 404", plain.Code)
	}
	if !strings.Contains(css.Body.String(), "@layer base, mui, components;") {
		t.Error("site.css lacks the layer order")
	}
}

// In production the assets are served the same way and every page area mounts.
func TestAssetsServeInProduction(t *testing.T) {
	h, _ := newHandler(t, config.Production)
	rec := do(h, http.MethodGet, "/assets/js/prepaint-theme.js", nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unhashed JS = %d", rec.Code)
	}
}

// The styleguide and layout previews exist in development only.
func TestStyleguideIsDevelopmentOnly(t *testing.T) {
	paths := []string{"/_styleguide", "/_styleguide/layout/public-hero", "/_styleguide/layout/public-plain",
		"/_styleguide/layout/auth", "/_styleguide/layout/onboarding", "/_styleguide/layout/client", "/_styleguide/layout/agent"}

	dev, _ := newHandler(t, config.Development)
	for _, p := range paths {
		rec := do(dev, http.MethodGet, p, nil)
		if rec.Code != http.StatusOK {
			t.Errorf("development GET %s = %d", p, rec.Code)
			continue
		}
		body := rec.Body.String()
		if strings.Contains(body, `data-slot="flash"`) && strings.Contains(body, "Page content goes here") {
			t.Errorf("%s shipped the layout's placeholder content", p)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%s is cacheable", p)
		}
	}

	prod, _ := newHandler(t, config.Production)
	for _, p := range paths {
		if rec := do(prod, http.MethodGet, p, nil); rec.Code != http.StatusNotFound {
			t.Errorf("production GET %s = %d, want 404", p, rec.Code)
		}
	}
}

// No page may carry anything the CSP would block: the loader refuses it at boot, so a
// server that starts has none. This checks what reaches the browser too.
func TestRenderedPagesStayInsideTheCSP(t *testing.T) {
	h, _ := newHandler(t, config.Development)
	inline := regexp.MustCompile(`<script(?:\s[^>]*)?>\s*[^<\s]|\sstyle="|\son[a-z]+="|<style`)
	for _, p := range []string{"/_styleguide", "/_styleguide/layout/public-hero", "/_styleguide/layout/agent", "/_demo"} {
		body := do(h, http.MethodGet, p, nil).Body.String()
		if loc := inline.FindStringIndex(body); loc != nil {
			t.Errorf("%s has inline script or style near %q", p, body[max(0, loc[0]-40):min(len(body), loc[1]+40)])
		}
	}
}
