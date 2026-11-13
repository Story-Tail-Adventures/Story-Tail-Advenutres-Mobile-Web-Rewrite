package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.10 Honeymoons (/honeymoons). Ports app/(public)/(hero)/honeymoons/page.tsx.

const honeymoonsPath = "/honeymoons"

const honeymoonsDescription = "A week that begins your marriage — quiet, unhurried, and built around the two of you. We handle the moving parts so you can be present."

// honeymoonStylePhotos are the three "ways to honeymoon" cards' photos, in page order.
var honeymoonStylePhotos = []content.ImageKey{"overwater", "overwater", "sunset"}

var honeymoonsSpec = page.Spec{
	File:   "public/honeymoons.html",
	Layout: shell.PublicHero,
	Slots: topicSlots("advisor-initials", "closing-body",
		"christian-primary", "christian-secondary", "christian-photo",
		"style-1-photo", "style-1-row-photo",
		"style-2-photo", "style-2-row-photo",
		"style-3-photo", "style-3-row-photo"),
	Repeats: tripTileRepeats(),
}

func (s *site) honeymoons(tmpl *page.Template) http.HandlerFunc {
	const topic = content.Honeymoons
	return func(w http.ResponseWriter, r *http.Request) {
		trips := search.TripsForTopic(s.cat.Trips, topic)

		d := tmpl.New()
		s.chrome(d, honeymoonsPath)
		s.head(d, meta{
			Title:       "Honeymoons",
			Description: honeymoonsDescription,
			Path:        honeymoonsPath,
			Image:       "overwater",
		})
		fillPhoto(d, "hero-photo", "overwater", photoOpts{Sizes: "100vw", Alt: decorative})
		fillInquiryDates(d, s.today())
		d.Text("advisor-initials", s.cat.Advisor.Initials)
		for i, key := range honeymoonStylePhotos {
			n := strconv.Itoa(i + 1)
			fillPhoto(d, "style-"+n+"-photo", key, photoOpts{Sizes: "(min-width: 1200px) 400px, 50vw", Alt: decorative})
			fillPhoto(d, "style-"+n+"-row-photo", key, photoOpts{Sizes: "100px", Alt: decorative})
		}

		d.Text("trips-overline", "FEATURED · "+strconv.Itoa(len(trips))+" "+plural(len(trips), "PACKAGE", "PACKAGES"))
		fillTripTiles(d, trips, topic, honeymoonsPath)

		quote := search.TopicQuoteLink(topic)
		message := search.InquiryHref(search.GuestInquiryContext{Source: "topic", Topic: topic})
		// The curated list is the results page filtered to the honeymoon vibe.
		curated := search.ResultsHref(search.SearchQuery{Vibes: []content.Vibe{"honeymoon"}})
		d.URL("christian-primary", "href", quote)
		d.URL("christian-secondary", "href", curated)
		fillPhoto(d, "christian-photo", "candlelit", photoOpts{Sizes: "280px", Alt: decorative})

		// The closing line carries the reply-time claim, so it is built from the registry.
		d.Text("closing-body", "Tell me the date, your two priorities (rest? adventure? privacy?), and a budget range. I'll send three honest options "+s.cat.Claim("replyWithin48h")+".")
		fillClosingCta(d, "honeymoon", quote, message)
		fillStickyCta(d, quote, message)
		s.render(w, d)
	}
}
