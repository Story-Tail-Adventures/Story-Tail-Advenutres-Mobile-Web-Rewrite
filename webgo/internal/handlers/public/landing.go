package public

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.1, the landing page at /. Ports app/(public)/(hero)/page.tsx and content.ts.

var landingSpec = page.Spec{
	File:   "public/landing.html",
	Layout: shell.PublicHero,
	Slots:  []string{"hero-photo", "reply-time"},
}

// The landing's metadata (LANDING.meta): an absolute title, so the template does not double
// the brand.
const (
	landingTitle       = "Story-Tail Adventures · Your travel portal"
	landingDescription = "Your portal for everything Story-Tail — trips in motion, every payment laid out plainly, and a place to dream up what's next."
)

// travelAgency is landingJsonLd: schema.org TravelAgency, deliberately minimal (no address,
// no aggregateRating while the figures are unverified).
type travelAgency struct {
	Context string   `json:"@context"`
	Type    string   `json:"@type"`
	Name    string   `json:"name"`
	URL     string   `json:"url"`
	SameAs  []string `json:"sameAs"`
}

func (s *site) landing(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := tmpl.New()
		s.chrome(d, "/")
		s.head(d, meta{
			Title:       landingTitle,
			Absolute:    true,
			Description: landingDescription,
			Path:        "/",
			Image:       "turks",
			JSONLD: travelAgency{
				Context: "https://schema.org",
				Type:    "TravelAgency",
				Name:    siteName,
				URL:     s.Config.SiteURL,
				SameAs:  []string{s.cat.Contact.MarketingSiteURL},
			},
		})
		fillPhoto(d, "hero-photo", "turks", photoOpts{Sizes: "100vw", Alt: decorative})
		// The reply-time figure comes from the claims registry, never typed in the page.
		d.Text("reply-time", "Threaded by trip. Reply usually "+s.cat.Claim("avgReplyTime")+".")
		s.renderFrontDoor(w, r, d)
	}
}
