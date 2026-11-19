package public

import (
	"bytes"
	"encoding/xml"
	"net/http"
	"net/url"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The port of web/app/seo.ts with app/sitemap.ts and app/robots.ts: /sitemap.xml and
// /robots.txt, byte for byte what Next wrote (testdata/ holds Next's own output).
//
// lastmod is always a content date, never the build clock: a sitemap that moves every deploy
// tells crawlers everything changed when nothing did.

// contentUpdated is the last edit to the copy of the static public pages.
const contentUpdated = "2026-09-02"

// staticPublicPaths are the indexable static routes, in nav order. /explore/results and /join
// are noindex, and /login and /register are auth screens, so none of them belong here.
var staticPublicPaths = []string{"/", "/how-it-works", "/about", "/caribbean", "/cruises", "/honeymoons", "/explore"}

// robotsDisallow are the trees crawlers should not enter; see app/seo.ts ROBOTS_DISALLOW for
// why /explore/results is here (a crawler walked its endless filter space nonstop).
var robotsDisallow = []string{"/dashboard", "/trips", "/account", "/agent", "/auth/", "/api/", "/quote", "/explore/results"}

// tripHref ports lib/public/links.ts tripHref.
func tripHref(slug string) string { return "/explore/" + url.PathEscape(slug) }

type sitemapEntry struct {
	loc, lastmod, changefreq string
	priority                 float64
}

// publicSitemap ports app/seo.ts publicSitemap: statics, then trips, then legal pages.
func publicSitemap(base string, c *content.Catalog) []sitemapEntry {
	var out []sitemapEntry
	for _, p := range staticPublicPaths {
		pr := 0.8
		if p == "/" {
			pr = 1
		}
		out = append(out, sitemapEntry{base + p, contentUpdated, "monthly", pr})
	}
	for _, t := range c.Trips {
		out = append(out, sitemapEntry{base + tripHref(t.Slug), t.PriceAsOf, "monthly", 0.6})
	}
	for _, slug := range c.LegalSlugs() {
		doc, _ := c.LegalDoc(slug)
		out = append(out, sitemapEntry{base + legalHref(slug), doc.LastUpdated, "yearly", 0.3})
	}
	return out
}

// sitemapXML writes the entries the way Next's metadata route serialised them.
func sitemapXML(entries []sitemapEntry) []byte {
	var b bytes.Buffer
	b.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
	for _, e := range entries {
		b.WriteString("<url>\n<loc>")
		_ = xml.EscapeText(&b, []byte(e.loc))
		b.WriteString("</loc>\n<lastmod>" + e.lastmod + "</lastmod>\n<changefreq>" + e.changefreq + "</changefreq>\n<priority>")
		b.WriteString(strconv.FormatFloat(e.priority, 'f', -1, 64))
		b.WriteString("</priority>\n</url>\n")
	}
	b.WriteString("</urlset>\n")
	return b.Bytes()
}

// robotsTxt ports app/seo.ts publicRobots as Next's metadata route wrote it.
func robotsTxt(base string) []byte {
	var b bytes.Buffer
	b.WriteString("User-Agent: *\nAllow: /\n")
	for _, d := range robotsDisallow {
		b.WriteString("Disallow: " + d + "\n")
	}
	b.WriteString("\nSitemap: " + base + "/sitemap.xml\n")
	return b.Bytes()
}

// plain serves a generated public file: cached like the public pages, no cookie.
func plain(contentType string, body func() []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		h := w.Header()
		h.Set("Content-Type", contentType)
		h.Set("Cache-Control", web.PublicCacheControl)
		_, _ = w.Write(body())
	}
}

func (s *site) sitemap() http.HandlerFunc {
	body := sitemapXML(publicSitemap(s.Config.SiteURL, s.cat))
	return plain("application/xml", func() []byte { return body })
}

func (s *site) robots() http.HandlerFunc {
	body := robotsTxt(s.Config.SiteURL)
	return plain("text/plain; charset=utf-8", func() []byte { return body })
}
