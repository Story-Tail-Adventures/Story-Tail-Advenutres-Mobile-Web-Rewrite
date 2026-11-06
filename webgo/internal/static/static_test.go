package static

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
)

func testSet(t *testing.T) *Set {
	t.Helper()
	fsys := fstest.MapFS{
		"css/a.css":          {Data: []byte("@layer base, mui, components;\n")},
		"css/b.css":          {Data: []byte(`@font-face { src: url("/assets/fonts/x.ttf"); } .x { background: url(/assets/img/y.webp) }` + "\n")},
		"fonts/x.ttf":        {Data: []byte("font bytes")},
		"img/y.webp":         {Data: []byte("image bytes")},
		"js/z.js":            {Data: []byte(strings.Repeat("console.log('compress me');\n", 50))},
		"icons.svg":          {Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a"/></svg>`)},
		"assets.go":          {Data: []byte("package assets")},
		"css/area/agent.css": {Data: []byte(".agent{}\n")},
	}
	s, err := Build(fsys, []Bundle{{Name: "css/site.css", Files: []string{"css/a.css", "css/b.css"}}})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func serve(s *Set, target string, header map[string]string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.Handle("GET "+Prefix+"{path...}", s)
	req := httptest.NewRequest(http.MethodGet, target, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

var hashed = regexp.MustCompile(`^/assets/css/site\.[0-9a-f]{10}\.css$`)

func TestNamesCarryAContentHash(t *testing.T) {
	s := testSet(t)
	u, ok := s.Lookup("/assets/css/site.css")
	if !ok || !hashed.MatchString(u) {
		t.Fatalf("Lookup(site.css) = %q, %v", u, ok)
	}
	if _, ok := s.Lookup("/assets/css/missing.css"); ok {
		t.Error("an unknown name resolved")
	}
	if _, ok := s.Lookup("/elsewhere/css/site.css"); ok {
		t.Error("a path outside /assets/ resolved")
	}
	if u, ok := s.Lookup("/assets/icons.svg#a"); !ok || !strings.HasSuffix(u, ".svg#a") || !strings.HasPrefix(u, "/assets/icons.") {
		t.Errorf("a #fragment did not survive: %q", u)
	}
	for _, n := range s.Names() {
		if strings.HasSuffix(n, ".go") {
			t.Errorf("Go source %s is served as an asset", n)
		}
	}
}

func TestChangedContentChangesTheName(t *testing.T) {
	a, _ := Build(fstest.MapFS{"js/x.js": {Data: []byte("1")}}, nil)
	b, _ := Build(fstest.MapFS{"js/x.js": {Data: []byte("2")}}, nil)
	ua, _ := a.Lookup("/assets/js/x.js")
	ub, _ := b.Lookup("/assets/js/x.js")
	if ua == ub {
		t.Errorf("two contents, one name: %s", ua)
	}
}

func TestServesHashedNamesWithImmutableCaching(t *testing.T) {
	s := testSet(t)
	u := s.MustURL("/assets/css/site.css")
	rec := serve(s, u, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s = %d", u, rec.Code)
	}
	h := rec.Header()
	if got := h.Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("Cache-Control = %q", got)
	}
	if got := h.Get("Content-Type"); got != "text/css; charset=utf-8" {
		t.Errorf("Content-Type = %q", got)
	}
	if h.Get("ETag") == "" {
		t.Error("no ETag")
	}
	// A revalidation with the ETag is a 304 with no body.
	again := serve(s, u, map[string]string{"If-None-Match": h.Get("ETag")})
	if again.Code != http.StatusNotModified || again.Body.Len() != 0 {
		t.Errorf("revalidation = %d with %d bytes", again.Code, again.Body.Len())
	}
}

func TestUnknownAndUnhashedNamesAre404(t *testing.T) {
	s := testSet(t)
	for _, target := range []string{
		"/assets/css/site.css",            // the plain name: never served, so an old page cannot get a new file
		"/assets/css/site.0000000000.css", // a stale or forged hash
		"/assets/css/missing.css",
		"/assets/assets.go",
	} {
		rec := serve(s, target, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", target, rec.Code)
		}
		if rec.Header().Get("Cache-Control") == CacheControl {
			t.Errorf("GET %s: a 404 must not be cached for a year", target)
		}
	}
}

func TestGzipWhenAskedAndWorthIt(t *testing.T) {
	s := testSet(t)
	u := s.MustURL("/assets/js/z.js")
	rec := serve(s, u, map[string]string{"Accept-Encoding": "br, gzip"})
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("no gzip for a compressible file")
	}
	if rec.Header().Get("Vary") != "Accept-Encoding" {
		t.Error("Vary: Accept-Encoding missing")
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(zr)
	want, _ := s.Body("js/z.js")
	if !bytes.Equal(plain, want) {
		t.Error("gzip body does not decode to the file")
	}
	for _, refused := range []string{"", "identity", "gzip;q=0", "deflate"} {
		if serve(s, u, map[string]string{"Accept-Encoding": refused}).Header().Get("Content-Encoding") != "" {
			t.Errorf("gzip sent for Accept-Encoding %q", refused)
		}
	}
}

func TestStylesheetURLsPointAtHashedAssets(t *testing.T) {
	s := testSet(t)
	body, _ := s.Body("css/site.css")
	css := string(body)
	if strings.Contains(css, `"/assets/fonts/x.ttf"`) || strings.Contains(css, "url(/assets/img/y.webp)") {
		t.Errorf("plain asset URLs left in the bundle:\n%s", css)
	}
	for _, plain := range []string{"/assets/fonts/x.ttf", "/assets/img/y.webp"} {
		if !strings.Contains(css, `url("`+s.MustURL(plain)+`")`) {
			t.Errorf("%s was not rewritten to %s", plain, s.MustURL(plain))
		}
	}
}

func TestBundleKeepsCascadeOrder(t *testing.T) {
	s := testSet(t)
	body, _ := s.Body("css/site.css")
	first := strings.Index(string(body), "@layer base, mui, components;")
	font := strings.Index(string(body), "@font-face")
	if first < 0 || font < 0 || first > font {
		t.Error("the @layer order statement must come before every other rule")
	}
}

func TestBuildRefusesBrokenReferences(t *testing.T) {
	_, err := Build(fstest.MapFS{"css/a.css": {Data: []byte(`.x { background: url("/assets/img/gone.webp") }`)}}, nil)
	if err == nil || !strings.Contains(err.Error(), "/assets/img/gone.webp") {
		t.Errorf("a url() to a missing asset built: %v", err)
	}
	_, err = Build(fstest.MapFS{"css/a.css": {Data: []byte("")}}, []Bundle{{Name: "css/site.css", Files: []string{"css/a.css", "css/nope.css"}}})
	if err == nil || !strings.Contains(err.Error(), "css/nope.css") {
		t.Errorf("a bundle naming a missing file built: %v", err)
	}
}

// The real assets: every bundle file exists, every url() resolves, and site.css opens with
// the layer statement.
func TestRealAssetsBuild(t *testing.T) {
	s, err := Build(assets.FS, Bundles)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := s.Body("css/site.css")
	css := regexp.MustCompile(`(?s)/\*.*?\*/`).ReplaceAllString(string(body), "")
	if !strings.HasPrefix(strings.TrimSpace(css), "@layer base, mui, components;") {
		t.Error("site.css must open with the @layer order statement")
	}
	if strings.Contains(css, "fonts.googleapis.com") {
		t.Error("runtime Google Fonts are forbidden (CLAUDE.md)")
	}
	for _, want := range []string{"/assets/js/prepaint-theme.js", "/assets/js/prepaint-auth.js", "/assets/js/theme.js", "/assets/js/ui.js", "/assets/icons.svg"} {
		if _, ok := s.Lookup(want); !ok {
			t.Errorf("%s is missing", want)
		}
	}
}
