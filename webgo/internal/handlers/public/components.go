package public

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// The shared public components whose words come from the content registry. Their markup is
// in each page file (a page is one plain HTML document), with the same slot names wherever
// they appear, and these fill them. Copy that is the page's own stays in the HTML.

// advisorBioSlots are AdvisorCard variant="bio"'s slots.
var advisorBioSlots = []string{"advisor-initials", "advisor-title", "advisor-bio", "advisor-rating", "advisor-travelers", "advisor-cred"}

// fillAdvisorBio fills AdvisorCard variant="bio": the advisor's name and bio, and three
// figures from the claims registry, never typed in a page.
func fillAdvisorBio(d *page.Doc, c *content.Catalog) {
	a := c.Advisor
	d.Text("advisor-initials", a.Initials)
	d.Attr("advisor-initials", "aria-label", a.Name)
	d.Text("advisor-title", "Meet "+a.Name+" · "+a.Title)
	d.Text("advisor-bio", a.ShortBio)
	d.Text("advisor-rating", c.Claim("ratingValue")+" · "+c.Claim("reviewCount")+" reviews")
	d.Text("advisor-travelers", c.Claim("travelersServed")+" travelers")
	d.Text("advisor-cred", c.Claim("credClia"))
}

// faqRepeat declares a FaqList's repeat for a page Spec.
func faqRepeat() map[string][]string {
	return map[string][]string{"faq": {"faq-item", "faq-q", "faq-a"}}
}

// fillFAQ fills a FaqList (MUI Accordion, here native <details name="...">, so opening one
// closes the others as the accordion did). The first item starts open (defaultOpenFirst).
func fillFAQ(d *page.Doc, items []content.FaqItem) {
	d.Repeat("faq", len(items), func(i int, r *page.Row) {
		r.Keep("faq-item")
		r.Bool("faq-item", "open", i == 0)
		r.Text("faq-q", items[i].Q)
		r.Text("faq-a", items[i].A)
	})
}
