package public

import (
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/analytics"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/hotels"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// site is what every public handler shares: the deps, and the per-page head metadata rules
// the Next root layout set (metadataBase, the title template, Open Graph and Twitter cards).
type site struct {
	handlers.Deps
	cat *content.Catalog
	// notFoundPage is the public 404, for an unknown slug.
	notFoundPage *page.Template
	// hotelFinder, when set, is the Searcher the results page uses instead of building one
	// from the environment. Only a test sets it, and it exists because the alternative is
	// worse: with no seam, every page test runs with the searcher switched off, so the
	// assertion that SERPAPI_API_KEY never reaches the HTML passes over a provider call that
	// never happened. A vacuous test of that rule is the one thing this area cannot have.
	hotelFinder *hotels.Searcher
}

// siteName is the root layout's applicationName and the title template's suffix.
const siteName = "Story-Tail Adventures"

// absoluteURL ports app/seo.ts absoluteUrl as Next's metadataBase resolved it: the root is
// the bare origin, with no trailing slash ("https://app.story-tail.com"), and every other
// path is appended to it.
func absoluteURL(base, path string) string {
	if path == "/" {
		return base
	}
	return base + path
}

// meta is one page's `metadata` export.
type meta struct {
	// Title is the page's own title, as its metadata wrote it. The <title> carries the
	// template ("%s · Story-Tail Adventures") unless Absolute is set; og:title and
	// twitter:title carry Title alone, as Next wrote them.
	Title    string
	Absolute bool
	// Description replaces the root layout's.
	Description string
	// Path is the canonical path ("/about"); og:url is the same.
	Path string
	// Image is the Open Graph photo, drawn 1200 by 630 from the registry.
	Image content.ImageKey
	// NoIndex writes a robots meta telling crawlers not to index this page (the join gate,
	// the results page).
	NoIndex bool
	// NoFollow also tells them not to follow its links. Set both on a page reached by a link
	// that carries somebody's own token, so the token is never walked (the unsubscribe page).
	NoFollow bool
	// NoCanonical leaves the canonical link out. Only the unsubscribe page sets it: its URL
	// carries somebody's own token, and Next's metadata there declares no canonical at all,
	// so writing one would be a link this page does not claim.
	NoCanonical bool
	// JSONLD is the page's structured data, if any.
	JSONLD any
}

// head writes m into the page's <head> the way Next's metadata API did.
func (s *site) head(d *page.Doc, m meta) {
	title := m.Title
	if !m.Absolute && title != "" {
		title += " · " + siteName
	}
	url := absoluteURL(s.Config.SiteURL, m.Path)
	canonical := url
	if m.NoCanonical {
		canonical = ""
	}
	h := page.Head{
		Title:       title,
		Description: m.Description,
		Canonical:   canonical,
		JSONLD:      m.JSONLD,
	}
	switch {
	case m.NoIndex && m.NoFollow:
		h.Robots = "noindex, nofollow"
	case m.NoIndex:
		h.Robots = "noindex, follow"
	case m.NoFollow:
		h.Robots = "index, nofollow"
	}
	h.Properties = append(h.Properties,
		page.Property{Name: "og:title", Content: m.Title},
		page.Property{Name: "og:description", Content: m.Description},
		page.Property{Name: "og:url", Content: url},
	)
	var image string
	if m.Image != "" {
		image = content.StaImg(m.Image, 1200, 630, 80)
		h.Properties = append(h.Properties,
			page.Property{Name: "og:image", Content: image},
			page.Property{Name: "og:image:width", Content: "1200"},
			page.Property{Name: "og:image:height", Content: "630"},
		)
	}
	h.Properties = append(h.Properties,
		page.Property{Name: "twitter:card", Content: "summary_large_image"},
		page.Property{Name: "twitter:title", Content: m.Title},
		page.Property{Name: "twitter:description", Content: m.Description},
	)
	if image != "" {
		h.Properties = append(h.Properties,
			page.Property{Name: "twitter:image", Content: image},
			page.Property{Name: "twitter:image:width", Content: "1200"},
			page.Property{Name: "twitter:image:height", Content: "630"},
		)
	}
	d.Head(h)
}

// chrome fills the public layout for the request. r may be nil for a page whose query string
// is never reportable anyway (a form, a link carrying somebody's own token): the analytics
// page is then the path alone. The placeholder banner shows while
// anything in the content registry is still a placeholder (content/public/proof.ts), and
// analytics is set up from the page this visitor may be reported on, never from the raw URL.
func (s *site) chrome(d *page.Doc, r *http.Request, path string) {
	shell.FillPublic(d, path, shell.PublicChrome{
		PlaceholderBanner: content.HasPlaceholders(s.cat.PlaceholderReport()),
		Analytics:         s.analytics(r, path),
	})
}

// analytics is what this page tells the browser module. The URL it reports is built from the
// site's own origin and this request's path and query, so a forged Host header cannot change
// what is sent, and it goes through the redaction before it is written anywhere.
func (s *site) analytics(r *http.Request, path string) shell.Analytics {
	if s.Config.AnalyticsMeasurementID == "" {
		return shell.Analytics{}
	}
	here := s.Config.SiteURL + path
	if r != nil && r.URL.RawQuery != "" {
		here += "?" + r.URL.RawQuery
	}
	redacted, ok := analytics.RedactURL(here)
	if !ok {
		return shell.Analytics{}
	}
	return shell.Analytics{MeasurementID: s.Config.AnalyticsMeasurementID, Page: redacted}
}

// today is the business day the public surface works in (the stay dates, a date floor), in
// the search time zone rather than the server's.
func (s *site) today() string {
	today, err := search.TodayISO(search.SearchTimeZone, time.Now())
	if err != nil {
		// The zone database is embedded (internal/handlers/public/search), so this cannot
		// happen in a built binary; a date floor is not worth a 500 if it ever did.
		s.Log.Error("the search time zone did not load", "err", err)
		return ""
	}
	return today
}

// render writes a public page: cached by Cloudflare, no cookie (§4.7). Every page that uses
// it reads nothing about the visitor, so one copy is right for everybody.
func (s *site) render(w http.ResponseWriter, d *page.Doc) {
	web.Render(w, s.Log, d, http.StatusOK, web.Shared)
}

// renderFrontDoor writes the one public page whose answer depends on the visitor: / is
// mounted with rt.FrontDoor, so a request carrying a session cookie has already been through
// GoTrue and could have been a redirect to /dashboard instead of this page.
//
// A response that depended on a cookie may not be stored by a shared cache, so the cookie
// variant is no-store and the page says it varies by Cookie. The anonymous variant, which is
// what a crawler and a first-time visitor get, is still cached for an hour.
//
// Vary is correct HTTP, and it is not the whole story at the edge: Cloudflare ignores Vary
// on anything but Accept-Encoding, so a cached anonymous copy can still be handed to a
// signed-in visitor, who then sees the landing page instead of being sent to /dashboard.
// That is the same class of thing as the signed-in chrome on cached public pages (§4.5), and
// the deployment answer is a cache rule that bypasses the cache when the session cookie is
// present (docs/GO-MIGRATION.md §4.7). That rule must name "__Host-sta-session", which is what
// an https server sets; "sta-session" is the local http:// name only, and a rule written
// against it would match nothing in production and cache the front door for everybody.
// Nothing deploys yet (ruling 16).
func (s *site) renderFrontDoor(w http.ResponseWriter, r *http.Request, d *page.Doc) {
	w.Header().Set("Vary", "Cookie")
	cache := web.Shared
	// Any cookie at all, not the session cookie by name. This asked for r.Cookie(
	// session.CookieName) until the auth area landed, and that was a bug waiting on another
	// team's constant: the session cookie is "sta-session" on a local http:// server and
	// "__Host-sta-session" everywhere else, the manager picks between them, and the chooser
	// is unexported. So the moment the real names arrived, this handler went on looking for
	// a name that production never sends, and the protection below quietly stopped working
	// with every test still green.
	//
	// Naming no cookie is the point. A visitor carrying anything gets the uncached answer,
	// which is a superset of the ones whose answer came from their session, and it cannot
	// drift from a decision another package owns. The cost is that a visitor who accepted
	// analytics carries _ga and so stops getting the cached front door; crawlers and
	// first-time visitors, which is who the hour of caching is for, carry nothing.
	if len(r.Cookies()) > 0 {
		cache = web.Private
	}
	web.Render(w, s.Log, d, http.StatusOK, cache)
}
