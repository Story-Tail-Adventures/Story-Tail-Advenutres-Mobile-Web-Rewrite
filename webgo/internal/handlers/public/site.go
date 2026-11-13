package public

import (
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
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
	// NoIndex writes robots "noindex, follow" (the join gate, the results page).
	NoIndex bool
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
	h := page.Head{
		Title:       title,
		Description: m.Description,
		Canonical:   url,
		JSONLD:      m.JSONLD,
	}
	if m.NoIndex {
		h.Robots = "noindex, follow"
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

// chrome fills the public layout for path. The placeholder banner shows while anything in
// the content registry is still a placeholder (content/public/proof.ts).
func (s *site) chrome(d *page.Doc, path string) {
	shell.FillPublic(d, path, shell.PublicChrome{
		PlaceholderBanner: content.HasPlaceholders(s.cat.PlaceholderReport()),
	})
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
// the deployment answer is a cache rule that bypasses the cache when sta-session is present
// (docs/GO-MIGRATION.md §4.7). Nothing deploys yet (ruling 16).
func (s *site) renderFrontDoor(w http.ResponseWriter, r *http.Request, d *page.Doc) {
	w.Header().Set("Vary", "Cookie")
	cache := web.Shared
	if _, err := r.Cookie(session.CookieName); err == nil {
		cache = web.Private
	}
	web.Render(w, s.Log, d, http.StatusOK, cache)
}
