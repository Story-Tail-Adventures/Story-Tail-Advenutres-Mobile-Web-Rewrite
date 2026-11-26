package public

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// GET /quote. Ports web/app/quote/route.ts: the Caribbean and Honeymoons inquiry bars submit
// here, and this only redirects. It builds the quote request link from what the visitor typed
// and sends them through the sign-up gate with it filled in.
//
// It is a route rather than a link because the bar's values are not known until submit, and
// the quote form's address nests them inside the gate's next=, which a GET form cannot write
// by itself. Working without JavaScript comes for free.
//
// Nothing is stored and nothing is called, so there is no page and nothing to cache. A
// submission naming no topic goes to /explore rather than to an error.
func (s *site) quote() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		web.SeeOther(w, r, search.QuoteRedirect(r.URL.Query(), s.today()))
	}
}
