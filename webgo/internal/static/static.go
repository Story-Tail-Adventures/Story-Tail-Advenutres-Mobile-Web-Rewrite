// Package static serves the embedded assets (webgo/assets) under content-hashed names, so
// every one of them can be cached for a year and a change still reaches the next visitor.
//
// At startup Build reads every file once, works out a short hash of its bytes, and keeps the
// bytes in memory:
//
//	css/ui.css  ->  /assets/css/ui.3f2a9c1b0d.css
//
// Three things are rewritten on the way, all from our own files, never from a request:
//
//   - Bundles. site.css is the stylesheets the layouts share, joined in cascade order, so a
//     page makes one CSS request instead of ten.
//   - url(/assets/...) inside a stylesheet becomes the hashed URL (fonts, the select arrow).
//     An unknown name fails the build, so a renamed font cannot ship as a 404.
//   - Pages: Lookup gives internal/page the hashed URL for each <link>, <script>, <img> and
//     <use> that names /assets/..., and the page loader rewrites it at startup.
//
// Only hashed names are served. /assets/css/ui.css (no hash), a stale hash and anything
// unknown are 404, so an old page can never be paired with a new stylesheet by accident.
package static

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"mime"
	"net/http"
	"path"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// Prefix is where assets are mounted.
const Prefix = "/assets/"

// CacheControl is sent with every asset. The name changes with the content, so a cached
// copy is never stale.
const CacheControl = "public, max-age=31536000, immutable"

// hashLen is the hex length of the content hash in a name: 40 bits, plenty to tell two
// versions of one file apart.
const hashLen = 10

// Bundle joins several stylesheets into one served file, in order.
type Bundle struct {
	Name  string   // the served name, e.g. "css/site.css"
	Files []string // source files, in cascade order
}

// Bundles are the joined stylesheets. site.css is everything every layout needs, in the
// order the cascade needs it: layers.css first, so the @layer order statement is the first
// thing the browser sees (the lesson of web/styles/layers.css and PR #120).
var Bundles = []Bundle{{
	Name: "css/site.css",
	Files: []string{
		"css/layers.css",
		"css/fonts.css",
		"css/tokens.css",
		"css/theme.css",
		"css/reset.css",
		"css/base.css",
		"css/ui.css",
		"css/components.css",
		"css/shell.css",
		"css/public.css",
		"css/client.css",
	},
}}

// Set is the built asset table. Read-only after Build, so safe for concurrent use.
type Set struct {
	byPlain  map[string]*file // "css/ui.css" -> file
	byHashed map[string]*file // "css/ui.3f2a9c1b0d.css" -> file
}

type file struct {
	plain  string
	hashed string
	ctype  string
	etag   string
	body   []byte
	gz     []byte // nil when compression would not help
}

// cssURL finds url(...) references to our own assets in a stylesheet: quoted or not.
var cssURL = regexp.MustCompile(`url\(\s*(["']?)(/assets/[^"')\s]+)(["']?)\s*\)`)

// Build reads every file in fsys and the bundles, hashes them, and rewrites stylesheet
// url()s. Every problem is reported at once.
func Build(fsys fs.FS, bundles []Bundle) (*Set, error) {
	s := &Set{byPlain: map[string]*file{}, byHashed: map[string]*file{}}
	raw := map[string][]byte{}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || strings.HasSuffix(p, ".go") {
			return nil
		}
		b, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		raw[p] = b
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("static: reading assets: %w", err)
	}

	var errs []error
	for _, b := range bundles {
		if _, dup := raw[b.Name]; dup {
			errs = append(errs, fmt.Errorf("static: bundle %s would hide a file of the same name", b.Name))
			continue
		}
		var buf bytes.Buffer
		for _, f := range b.Files {
			body, ok := raw[f]
			if !ok {
				errs = append(errs, fmt.Errorf("static: bundle %s names %s, which does not exist", b.Name, f))
				continue
			}
			fmt.Fprintf(&buf, "/* --- %s --- */\n", f)
			buf.Write(body)
			if !bytes.HasSuffix(body, []byte("\n")) {
				buf.WriteByte('\n')
			}
		}
		raw[b.Name] = buf.Bytes()
	}

	// Everything but stylesheets first, so a stylesheet's url()s can name their hashes.
	names := slices.Sorted(maps.Keys(raw))
	for _, p := range names {
		if path.Ext(p) != ".css" {
			s.add(p, raw[p])
		}
	}
	for _, p := range names {
		if path.Ext(p) != ".css" {
			continue
		}
		body, err := s.rewriteCSS(p, raw[p])
		if err != nil {
			errs = append(errs, err)
			continue
		}
		s.add(p, body)
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Set) rewriteCSS(name string, body []byte) ([]byte, error) {
	var errs []error
	out := cssURL.ReplaceAllFunc(body, func(m []byte) []byte {
		sub := cssURL.FindSubmatch(m)
		target := string(sub[2])
		if u, ok := s.Lookup(target); ok {
			return []byte(`url("` + u + `")`)
		}
		errs = append(errs, fmt.Errorf("static: %s refers to %s, which is not an asset", name, target))
		return m
	})
	return out, errors.Join(errs...)
}

func (s *Set) add(plain string, body []byte) {
	sum := sha256.Sum256(body)
	h := hex.EncodeToString(sum[:])[:hashLen]
	ext := path.Ext(plain)
	hashed := strings.TrimSuffix(plain, ext) + "." + h + ext
	f := &file{
		plain:  plain,
		hashed: hashed,
		ctype:  contentType(ext),
		etag:   `"` + h + `"`,
		body:   body,
	}
	if compressible(ext) {
		var b bytes.Buffer
		// Default, not best: the fonts are 2 MB and this runs at every start.
		zw, _ := gzip.NewWriterLevel(&b, gzip.DefaultCompression)
		_, _ = zw.Write(body)
		_ = zw.Close()
		if b.Len() < len(body) {
			f.gz = b.Bytes()
		}
	}
	s.byPlain[plain] = f
	s.byHashed[hashed] = f
}

func contentType(ext string) string {
	switch ext {
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".ttf":
		return "font/ttf"
	case ".woff2":
		return "font/woff2"
	case ".webp":
		return "image/webp"
	case ".png":
		return "image/png"
	case ".ico":
		// Explicit: mime.TypeByExtension reads the host's tables, and a slim image has none.
		return "image/x-icon"
	case ".txt":
		return "text/plain; charset=utf-8"
	}
	if t := mime.TypeByExtension(ext); t != "" {
		return t
	}
	return "application/octet-stream"
}

func compressible(ext string) bool {
	switch ext {
	case ".css", ".js", ".svg", ".txt", ".ttf":
		return true
	}
	return false
}

// Lookup turns "/assets/css/ui.css" (optionally with a #fragment, for the icon sprite) into
// its hashed URL. It reports false for anything that is not an asset.
func (s *Set) Lookup(u string) (string, bool) {
	rest, ok := strings.CutPrefix(u, Prefix)
	if !ok {
		return "", false
	}
	name, frag, hasFrag := strings.Cut(rest, "#")
	f, ok := s.byPlain[name]
	if !ok {
		return "", false
	}
	out := Prefix + f.hashed
	if hasFrag {
		out += "#" + frag
	}
	return out, true
}

// MustURL is Lookup for a name the code itself knows (a test, the styleguide). It panics on
// an unknown name, which is a programming error caught at startup.
func (s *Set) MustURL(u string) string {
	out, ok := s.Lookup(u)
	if !ok {
		panic(fmt.Sprintf("static: %s is not an asset", u))
	}
	return out
}

// Names lists the plain names, sorted. For tests.
func (s *Set) Names() []string { return slices.Sorted(maps.Keys(s.byPlain)) }

// Body returns a file's served bytes by plain name. For tests.
func (s *Set) Body(plain string) ([]byte, bool) {
	f, ok := s.byPlain[plain]
	if !ok {
		return nil, false
	}
	return f.body, true
}

// ServeHTTP serves one hashed asset. Mount it on "GET /assets/{path...}" as a public route.
// It reads no cookie and calls nothing.
func (s *Set) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f, ok := s.byHashed[r.PathValue("path")]
	if !ok {
		w.Header().Set("Cache-Control", "no-store")
		http.NotFound(w, r)
		return
	}
	h := w.Header()
	h.Set("Content-Type", f.ctype)
	h.Set("Cache-Control", CacheControl)
	h.Set("ETag", f.etag)
	h.Set("Vary", "Accept-Encoding")
	if match := r.Header.Get("If-None-Match"); match != "" && etagMatches(match, f.etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	body := f.body
	if f.gz != nil && acceptsGzip(r.Header.Get("Accept-Encoding")) {
		h.Set("Content-Encoding", "gzip")
		body = f.gz
	}
	h.Set("Content-Length", fmt.Sprint(len(body)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(body)
}

func etagMatches(header, etag string) bool {
	for _, part := range strings.Split(header, ",") {
		p := strings.TrimSpace(part)
		if p == "*" || p == etag || strings.TrimPrefix(p, "W/") == etag {
			return true
		}
	}
	return false
}

// acceptsGzip reads Accept-Encoding for gzip with a q-value above zero.
func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		enc, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(enc), "gzip") {
			continue
		}
		q := 1.0
		for _, p := range strings.Split(params, ";") {
			k, v, ok := strings.Cut(strings.TrimSpace(p), "=")
			if ok && strings.EqualFold(k, "q") {
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					q = f
				}
			}
		}
		return q > 0
	}
	return false
}
