package public

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The public not-found page (app/(public)/not-found.tsx): an unknown trip or legal slug. Every
// other unknown path keeps the server's plain 404, which costs nothing (bots probing /.env).

var notFoundSpec = page.Spec{File: "public/not-found.html", Layout: shell.PublicPlain}

// notFound answers 404 with the public not-found page, uncached and noindex, as Next did.
func (s *site) notFound(w http.ResponseWriter, r *http.Request) {
	d := s.notFoundPage.New()
	s.chrome(d, r.URL.Path)
	d.Head(page.Head{Robots: "noindex"})
	web.Render(w, s.Log, d, http.StatusNotFound, web.Shared)
}
