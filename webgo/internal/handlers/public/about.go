package public

import (
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.11 About Gyasi (/about). Ports app/(public)/(hero)/about/page.tsx.

const aboutPath = "/about"

var aboutSpec = page.Spec{
	File:   "public/about.html",
	Layout: shell.PublicHero,
	Slots: []string{
		"hero-lead", "hero-primary", "hero-secondary", "portrait-initials", "portrait-initials-m",
		"story-1a", "story-1b", "signature",
		"stat-1-value", "stat-1-label", "stat-2-value", "stat-2-label",
		"stat-3-value", "stat-3-label", "stat-4-value", "stat-4-label",
		"closing-photo", "closing-primary", "closing-secondary",
		"sticky-primary", "sticky-secondary",
	},
	Repeats: map[string][]string{
		"credentials":  {"credential-title", "credential-detail"},
		"testimonials": {"quote", "initials", "who", "trip"},
		"faq":          {"faq-item", "faq-q", "faq-a"},
	},
}

// aboutStat is one figure in the strip under the hero. Every value and label is a claim, so
// the page cannot state a number the registry has not seen. The icons are fixed per figure
// and stay in the HTML.
type aboutStat struct {
	value, label string
}

// aboutStats builds the four figures (about/content.ts ABOUT_STATS). detailOf falls back to
// the same wording the TypeScript used when a claim carries no detail line.
func aboutStats(c *content.Catalog) []aboutStat {
	detailOf := func(id, fallback string) string {
		if claim, ok := c.ClaimEntry(id); ok && claim.Detail != nil {
			return *claim.Detail
		}
		return fallback
	}
	return []aboutStat{
		{c.Claim("travelersServed"), detailOf("travelersServed", "Travelers served")},
		{c.Claim("ratingValue") + " ★", c.Claim("reviewCount") + " reviews"},
		{c.Claim("avgReplyTime"), detailOf("avgReplyTime", "Avg reply time")},
		{c.Claim("yearsSpecialist"), detailOf("yearsSpecialist", "Caribbean specialist")},
	}
}

// aboutCredentials are the four cards, in the order the page lists them.
var aboutCredentials = []string{"credInteletravel", "credClia", "credSandals", "credRoyal"}

func (s *site) about(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := tmpl.New()
		s.chrome(d, aboutPath)
		s.head(d, meta{
			Title:       "About Gyasi",
			Description: s.cat.Advisor.ShortBio,
			Path:        aboutPath,
			Image:       "honeymoon",
		})

		quote := search.JoinHref(search.JoinLink{Intent: "quote", Next: aboutPath})
		message := search.InquiryHref(search.GuestInquiryContext{Source: "about"})
		d.Text("hero-lead", s.cat.AdvisorHeroLine())
		d.URL("hero-primary", "href", quote)
		d.URL("hero-secondary", "href", message)
		for _, slot := range []string{"portrait-initials", "portrait-initials-m"} {
			d.Text(slot, s.cat.Advisor.Initials)
		}

		for i, stat := range aboutStats(s.cat) {
			n := strconv.Itoa(i + 1)
			d.Text("stat-"+n+"-value", stat.value)
			d.Text("stat-"+n+"-label", stat.label)
		}

		// The first paragraph names the years the business started and got its name, so it is
		// built from the registry rather than typed into the page.
		d.Text("story-1a", "I started planning trips for friends in "+s.cat.Claim("bioStarted")+
			" because they kept asking. I'd done enough Caribbean weeks of my own to know which resorts were worth it and which were paying for good Google ads. By "+
			s.cat.Claim("bioNamed")+" the side-thing had a name — ")
		d.Text("story-1b", " — and a backlog.")
		d.Text("signature", "— "+s.cat.Advisor.FirstName)

		d.Repeat("credentials", len(aboutCredentials), func(i int, row *page.Row) {
			claim, _ := s.cat.ClaimEntry(aboutCredentials[i])
			row.Text("credential-title", claim.Display)
			if claim.Detail != nil {
				row.Text("credential-detail", *claim.Detail)
			} else {
				row.Remove("credential-detail")
			}
		})

		notes := s.cat.Testimonials
		d.Repeat("testimonials", len(notes), func(i int, row *page.Row) {
			row.Text("quote", notes[i].Quote)
			row.Text("initials", notes[i].Initials)
			row.Text("who", notes[i].Who)
			row.Text("trip", notes[i].Trip)
		})
		fillFAQ(d, s.cat.GyasiFAQ)

		fillClosingCta(d, "sunset", quote, message)
		fillStickyCta(d, quote, message)
		s.render(w, d)
	}
}
