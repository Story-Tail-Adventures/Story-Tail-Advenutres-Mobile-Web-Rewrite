package public

import "github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"

// CachedPaths lists every public URL that must render for anyone, read no cookie, call
// nothing outside this server, and carry web.PublicCacheControl: the static pages (the
// sitemap's own list), one URL per trip and legal slug, and the generated files. The cache
// test (cache_test.go, which replaced .github/scripts/check_public_prerender.py) walks it, so
// a page that starts reading a cookie or calling Supabase fails CI instead of silently
// turning the marketing site into per-request work.
//
// Search results, the lead form's post and the join gate are not here: they are the routes
// that may read a request or call a function (docs/GO-MIGRATION.md §4.7).
func CachedPaths(c *content.Catalog) []string {
	out := []string{}
	for _, p := range staticPublicPaths {
		if mounted[p] {
			out = append(out, p)
		}
	}
	for _, t := range c.Trips {
		if mounted["/explore/{slug}"] {
			out = append(out, tripHref(t.Slug))
		}
	}
	for _, slug := range c.LegalSlugs() {
		out = append(out, legalHref(slug))
	}
	return append(out, "/sitemap.xml", "/robots.txt")
}

// mounted marks which of the sitemap's pages exist in Go yet. Phase 2 builds them one PR at
// a time; when every one is here this map goes, and CachedPaths lists them all.
var mounted = map[string]bool{"/": true, "/how-it-works": true, "/caribbean": true, "/cruises": true, "/honeymoons": true}
