// Package web is what every page handler shares: writing a filled page with the right
// status and cache headers, the one-time flash after a redirect, reading a posted form
// within a size limit, and turning a function call's result into what the page shows.
//
// The rules it holds (docs/GO-MIGRATION.md §4.3, §4.7, §4.9):
//
//   - A gated page is never cached anywhere (no-store). A public page is cached by Cloudflare
//     (s-maxage) and must not set a cookie; Render refuses to cache one that does.
//   - A page that failed to fill is a 500 with nothing of it sent: half a page never ships.
//   - Writes post, then 303. A rejection re-renders the same page with the visitor's values
//     and the function's own `detail` sentence (422), or 409 for the optimistic lock.
//   - Copy is the Next app's, word for word (auth-errors.go).
package web

import (
	"log/slog"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Cache says who may keep a copy of a response.
type Cache int

const (
	// Private is for every gated or personal page: no copy anywhere, not even the browser's
	// back-forward cache of a signed-out tab.
	Private Cache = iota
	// Shared is for public pages that read no cookie: Cloudflare keeps them for an hour and
	// serves a stale copy while it refreshes. The browser does not keep its own.
	Shared
)

const (
	// NoStore is the Cache-Control for Private.
	NoStore = "no-store"
	// PublicCacheControl is the Cache-Control for Shared (§4.7).
	PublicCacheControl = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
)

// ServerError is the plain sentence a 500 carries, matching the server's other 500s.
const ServerError = "Something went wrong."

// Render writes a filled page. A page with any unfilled slot or setter mistake renders
// nothing: the visitor gets a plain 500 and the log gets every problem.
func Render(w http.ResponseWriter, log *slog.Logger, d *page.Doc, status int, cache Cache) {
	body, err := d.Bytes()
	if err != nil {
		log.Error("page did not render", "err", err)
		Error(w, http.StatusInternalServerError)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	switch {
	case cache == Shared && len(h.Values("Set-Cookie")) > 0:
		// A cached page with a cookie on it would hand one visitor's cookie to the next.
		log.Error("public page set a cookie; serving it uncached")
		h.Set("Cache-Control", NoStore)
	case cache == Shared && status == http.StatusOK:
		h.Set("Cache-Control", PublicCacheControl)
	default:
		h.Set("Cache-Control", NoStore)
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// Error writes a bare error status with a plain sentence. Use it only where no page can be
// drawn (a broken page, a malformed form); a page that can explain itself should.
func Error(w http.ResponseWriter, status int) {
	h := w.Header()
	h.Set("Content-Type", "text/plain; charset=utf-8")
	h.Set("Cache-Control", NoStore)
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	msg := http.StatusText(status)
	if status >= 500 {
		msg = ServerError
	}
	_, _ = w.Write([]byte(msg + "\n"))
}

// SeeOther ends a successful post: a 303 to target, which must be a path on this site.
func SeeOther(w http.ResponseWriter, r *http.Request, target string) {
	w.Header().Set("Cache-Control", NoStore)
	http.Redirect(w, r, target, http.StatusSeeOther)
}
