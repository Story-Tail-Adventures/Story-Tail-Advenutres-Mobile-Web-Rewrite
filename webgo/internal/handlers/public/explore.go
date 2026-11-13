package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.3 Public Search Landing (/explore). Ports app/(public)/(hero)/explore/page.tsx.

const explorePath = "/explore"

const exploreDescription = "Find your next chapter. Browse Caribbean escapes, family cruises, honeymoons and all-inclusive weeks — no account needed."

var exploreSpec = page.Spec{
	File:   "public/explore.html",
	Layout: shell.PublicHero,
	Slots: []string{
		"hero-photo", "pill-in", "pill-out", "stacked-in", "stacked-out",
		"banner-signin", "trust-line", "sticky-signin",
	},
	Repeats: map[string][]string{
		"tiles": {"tile-link", "tile-photo", "tile-title", "tile-count"},
	},
}

func (s *site) explore(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := tmpl.New()
		s.chrome(d, explorePath)
		s.head(d, meta{
			Title:       "Explore",
			Description: exploreDescription,
			Path:        explorePath,
			Image:       "bahamas",
		})
		fillPhoto(d, "hero-photo", "bahamas", photoOpts{Sizes: "100vw", Alt: decorative})

		// Both search forms are bounded the same way the inquiry bars are.
		today := s.today()
		latest, hasLatest := search.AddDays(today, search.MaxBookingDaysAhead)
		for _, slot := range []string{"pill-in", "pill-out", "stacked-in", "stacked-out"} {
			d.Attr(slot, "min", today)
			if hasLatest {
				d.Attr(slot, "max", latest)
			}
		}

		// Each tile starts the search it stands for; its count comes from the catalog.
		tiles := s.cat.Inspiration
		d.Repeat("tiles", len(tiles), func(i int, row *page.Row) {
			q := tileSearchQuery(tiles[i])
			row.URL("tile-link", "href", search.ResultsHref(q))
			fillPhoto(row, "tile-photo", tiles[i].ImageKey, photoOpts{
				Sizes: "(min-width: 1200px) 400px, (min-width: 768px) 33vw, 50vw", Alt: decorative,
			})
			row.Text("tile-title", tiles[i].Title)
			n := len(search.FilterTrips(s.cat.Trips, q))
			row.Text("tile-count", strconv.Itoa(n)+" "+plural(n, "trip", "trips"))
		})

		d.URL("banner-signin", "href", search.LoginHref(explorePath))
		d.URL("sticky-signin", "href", search.LoginHref(explorePath))
		d.Text("trust-line", s.cat.TrustLine())
		s.render(w, d)
	}
}

// tileSearchQuery is the search one inspiration tile pre-fills (explore/content.ts).
func tileSearchQuery(tile content.InspirationTile) search.SearchQuery {
	q := search.SearchQuery{Sort: "best-fit"}
	if tile.Query.Dest != nil {
		q.Dest = *tile.Query.Dest
	}
	if tile.Query.Topic != nil {
		q.Topic = *tile.Query.Topic
	}
	if tile.Query.Type != nil {
		q.Types = append(q.Types, *tile.Query.Type)
	}
	if tile.Query.Vibe != nil {
		q.Vibes = append(q.Vibes, *tile.Query.Vibe)
	}
	return q
}
