package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.8 Caribbean (/caribbean). Ports app/(public)/(hero)/caribbean/page.tsx.

const caribbeanPath = "/caribbean"

var caribbeanSpec = page.Spec{
	File:    "public/caribbean.html",
	Layout:  shell.PublicHero,
	Slots:   topicSlots("hero-sub", "trips-sub", "see-all"),
	Repeats: caribbeanRepeats(),
}

func caribbeanRepeats() map[string][]string {
	r := tripTileRepeats()
	r["islands"] = []string{"island-link", "island-photo", "island-name"}
	r["islands-strip"] = []string{"strip-link", "strip-photo", "strip-name"}
	return r
}

func (s *site) caribbean(tmpl *page.Template) http.HandlerFunc {
	const topic = content.Caribbean
	return func(w http.ResponseWriter, r *http.Request) {
		// The hero line and the catalog note carry registry claims, so they are built here
		// rather than typed into the page.
		heroSub := s.cat.Claim("islandsPlannedAll") + " The hard part isn't finding a good week — it's choosing which good one."
		trips := search.TripsForTopic(s.cat.Trips, topic)
		total := search.CountByTopic(s.cat.Trips, topic)

		d := tmpl.New()
		s.chrome(d, caribbeanPath)
		s.head(d, meta{
			Title:       "Caribbean vacations",
			Description: heroSub,
			Path:        caribbeanPath,
			Image:       "turks",
		})
		fillPhoto(d, "hero-photo", "turks", photoOpts{Sizes: "100vw", Alt: decorative})
		d.Text("hero-sub", heroSub)
		fillInquiryDates(d, s.today())

		// Each island tile starts a search for that island by name.
		islands := s.cat.Islands
		for _, rep := range []struct{ name, prefix, sizes string }{
			{"islands", "island", "(min-width: 1200px) 220px, 33vw"},
			{"islands-strip", "strip", "110px"},
		} {
			d.Repeat(rep.name, len(islands), func(i int, row *page.Row) {
				island := islands[i]
				row.URL(rep.prefix+"-link", "href", search.ResultsHref(search.SearchQuery{Dest: island.Name}))
				fillPhoto(row, rep.prefix+"-photo", island.ImageKey, photoOpts{Sizes: rep.sizes, Alt: decorative})
				row.Text(rep.prefix+"-name", island.Name)
			})
		}

		d.Text("trips-overline", "HAND-PICKED · "+strconv.Itoa(len(trips))+" "+plural(len(trips), "TRIP", "TRIPS"))
		d.Text("trips-sub", s.cat.Claim("catalogUpdatedMonthly")+" The $ chip is a rough range — request a quote to see real prices for your dates.")
		fillTripTiles(d, trips, topic, caribbeanPath)

		browse := search.ResultsHref(search.SearchQuery{Topic: topic})
		d.Text("see-all", "See all "+strconv.Itoa(total)+" Caribbean "+plural(total, "trip", "trips")+" →")
		d.URL("see-all", "href", browse)

		// Straight to the quote form for this topic, through the gate: the gate with this page
		// as next forwarded a signed-in visitor right back here.
		quote := search.TopicQuoteLink(topic)
		message := search.InquiryHref(search.GuestInquiryContext{Source: "topic", Topic: topic})
		fillClosingCta(d, "overwater", quote, message)
		fillStickyCta(d, quote, browse)
		s.render(w, d)
	}
}
