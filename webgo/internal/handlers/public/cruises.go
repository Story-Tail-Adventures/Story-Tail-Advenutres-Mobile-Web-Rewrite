package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.9 Cruises (/cruises). Ports app/(public)/(hero)/cruises/page.tsx.

const cruisesPath = "/cruises"

const cruisesDescription = "Unpack once. See three islands. The ship handles dinner, the towel art, the kids' club — you handle being on a balcony at sunrise."

// cruiseTypePhotos are the three "who it's for" cards' photos, in the order the page draws
// them, each shown as a card from md and as a row below it.
var cruiseTypePhotos = []content.ImageKey{"cruiseShip", "cruiseAerial", "overwater"}

var cruisesSpec = page.Spec{
	File:   "public/cruises.html",
	Layout: shell.PublicHero,
	Slots: topicSlots("types-sub", "see-all",
		"type-1-photo", "type-1-row-photo",
		"type-2-photo", "type-2-row-photo",
		"type-3-photo", "type-3-row-photo"),
	Repeats: cruisesRepeats(),
}

func cruisesRepeats() map[string][]string {
	r := tripTileRepeats()
	r["lines"] = []string{"line-name"}
	return r
}

func (s *site) cruises(tmpl *page.Template) http.HandlerFunc {
	const topic = content.Cruises
	return func(w http.ResponseWriter, r *http.Request) {
		trips := search.TripsForTopic(s.cat.Trips, topic)
		total := search.CountByTopic(s.cat.Trips, topic)

		d := tmpl.New()
		s.chrome(d, cruisesPath)
		s.head(d, meta{
			Title:       "Cruises",
			Description: cruisesDescription,
			Path:        cruisesPath,
			Image:       "cruiseAerial",
		})
		fillPhoto(d, "hero-photo", "cruiseAerial", photoOpts{Sizes: "100vw", Alt: decorative})
		fillInquiryDates(d, s.today())
		d.Text("types-sub", s.cat.Claim("sailsEachLineYearly"))
		for i, key := range cruiseTypePhotos {
			n := strconv.Itoa(i + 1)
			fillPhoto(d, "type-"+n+"-photo", key, photoOpts{Sizes: "(min-width: 1200px) 400px, 50vw", Alt: decorative})
			fillPhoto(d, "type-"+n+"-row-photo", key, photoOpts{Sizes: "100px", Alt: decorative})
		}

		lines := s.cat.CruiseLines
		d.Repeat("lines", len(lines), func(i int, row *page.Row) { row.Text("line-name", lines[i].Name) })

		d.Text("trips-overline", "HAND-PICKED · "+strconv.Itoa(len(trips))+" "+plural(len(trips), "SAILING", "SAILINGS"))
		fillTripTiles(d, trips, topic, cruisesPath)

		browse := search.ResultsHref(search.SearchQuery{Topic: topic})
		d.Text("see-all", "See all "+strconv.Itoa(total)+" "+plural(total, "sailing", "sailings")+" →")
		d.URL("see-all", "href", browse)

		quote := search.TopicQuoteLink(topic)
		message := search.InquiryHref(search.GuestInquiryContext{Source: "topic", Topic: topic})
		fillClosingCta(d, "cruiseShip", quote, message)
		fillStickyCta(d, quote, browse)
		s.render(w, d)
	}
}
