package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.5 Trip detail (/explore/{slug}). Ports app/(public)/(hero)/explore/[slug].

var tripSpec = page.Spec{
	File:   "public/trip.html",
	Layout: shell.PublicHero,
	Slots: []string{
		"hero-photo", "badge", "name", "place", "review", "review-text", "hero-save",
		"description", "price", "price-note", "price-quote", "price-save", "price-guest",
		"advisor-initials", "advisor-title", "price-note-m", "advisor-initials-m",
		"advisor-title-m", "advisor-message",
		"sticky-price", "sticky-save", "sticky-quote", "sticky-guest",
	},
	Repeats: map[string][]string{
		"highlights": {"highlight-icon", "highlight-text"},
		"itinerary":  {"day-n", "day-text"},
	},
}

// plannedClaimBySlug names the trips whose advisor line carries a count from the registry
// (explore/[slug]/content.ts PLANNED_CLAIM_BY_SLUG).
var plannedClaimBySlug = map[string]string{"sandals-royal-bahamian": "plannedRoyalBahamian"}

// advisorTitle is the advisor card's line for this trip.
func (s *site) advisorTitle(slug string) string {
	if id, ok := plannedClaimBySlug[slug]; ok {
		return "Gyasi planned " + s.cat.Claim(id) + " of these"
	}
	return "Gyasi knows this one well"
}

// tripBadge is the pill over the photo: the trip type, and the nights when it has them.
func tripBadge(trip content.Trip) string {
	badge := search.TripTypeLabels[trip.Type]
	if trip.Nights != nil {
		badge += " · " + strconv.Itoa(*trip.Nights) + " " + plural(*trip.Nights, "night", "nights")
	}
	return badge
}

func (s *site) trip(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		trip, ok := s.cat.Trip(r.PathValue("slug"))
		if !ok {
			s.notFound(w, r)
			return
		}
		path := search.TripHref(trip.Slug)
		quote := search.JoinHref(search.JoinLink{Intent: "quote", Trip: trip.Slug, Next: path})
		save := search.JoinHref(search.JoinLink{Intent: "save", Trip: trip.Slug, Next: path})
		message := search.InquiryHref(search.GuestInquiryContext{
			Source: "detail",
			Trip:   &search.InquiryTrip{Slug: trip.Slug, Name: trip.Name},
		})

		hero := trip.ImageKey
		if trip.HeroImageKey != nil {
			hero = *trip.HeroImageKey
		}

		d := tmpl.New()
		s.chrome(d, path)
		s.head(d, meta{
			Title:       trip.Name,
			Description: trip.Description,
			Path:        path,
			Image:       hero,
			// Structured data is a BreadcrumbList only: no Product or Offer while the prices
			// are illustrative, and no AggregateRating while the reviews are unverified.
			JSONLD: s.breadcrumb(trip),
		})
		fillPhoto(d, "hero-photo", hero, photoOpts{Sizes: "100vw", Alt: decorative})
		d.Text("badge", tripBadge(trip))
		d.Text("name", trip.Name)
		d.Text("place", trip.Destination.Place)
		if review, ok := s.cat.TripReview(trip.Slug); ok {
			d.Keep("review")
			d.Text("review-text", review.Display)
		} else {
			d.Remove("review")
		}
		d.URL("hero-save", "href", save)
		d.Attr("hero-save", "aria-label", "Save "+trip.Name+" for later")
		d.Text("description", trip.Description)

		d.Repeat("highlights", len(trip.Highlights), func(i int, row *page.Row) {
			row.Icon("highlight-icon", trip.Highlights[i].Icon)
			row.Text("highlight-text", trip.Highlights[i].Text)
		})
		d.Repeat("itinerary", len(trip.SampleItinerary), func(i int, row *page.Row) {
			row.Text("day-n", strconv.Itoa(i+1))
			row.Text("day-text", trip.SampleItinerary[i])
		})

		price, err := search.FormatMoney(trip.From, search.MoneyOptions{Whole: true})
		if err != nil {
			s.Log.Error("a trip price did not format", "slug", trip.Slug, "err", err)
			price = ""
		}
		d.Text("price", price)
		d.Text("price-note", trip.PriceNote)
		d.Text("price-note-m", trip.PriceNote)
		d.URL("price-quote", "href", quote)
		d.URL("price-save", "href", save)
		d.URL("price-guest", "href", message)

		title := s.advisorTitle(trip.Slug)
		d.Text("advisor-initials", s.cat.Advisor.Initials)
		d.Text("advisor-initials-m", s.cat.Advisor.Initials)
		d.Text("advisor-title", title)
		d.Text("advisor-title-m", title)
		d.URL("advisor-message", "href", message)

		d.Text("sticky-price", price)
		d.URL("sticky-save", "href", save)
		d.URL("sticky-quote", "href", quote)
		d.URL("sticky-guest", "href", message)
		s.render(w, d)
	}
}

// breadcrumbItem is one step of the schema.org BreadcrumbList.
type breadcrumbItem struct {
	Type     string `json:"@type"`
	Position int    `json:"position"`
	Name     string `json:"name"`
	Item     string `json:"item"`
}

// breadcrumbList is the page's structured data (explore/[slug]/seo.ts).
type breadcrumbList struct {
	Context  string           `json:"@context"`
	Type     string           `json:"@type"`
	Elements []breadcrumbItem `json:"itemListElement"`
}

func (s *site) breadcrumb(trip content.Trip) breadcrumbList {
	base := s.Config.SiteURL
	return breadcrumbList{
		Context: "https://schema.org",
		Type:    "BreadcrumbList",
		Elements: []breadcrumbItem{
			{"ListItem", 1, "Explore", base + explorePath},
			{"ListItem", 2, trip.Name, base + search.TripHref(trip.Slug)},
		},
	}
}
