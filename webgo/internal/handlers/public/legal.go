package public

import (
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.7, the four footer pages (/legal/{slug}). Ports app/(public)/(plain)/legal/[slug].

var legalSpec = page.Spec{
	File:   "public/legal.html",
	Layout: shell.PublicPlain,
	Slots:  []string{"title", "updated", "draft", "legal-list"},
	Repeats: map[string][]string{
		"aside":        {"aside-link", "aside-title"},
		"chip":         {"chip-link", "chip-label"},
		"legal-pre":    {"pre-heading", "pre-para"},
		"legal-bullet": {"bullet"},
		"legal-post":   {"post-heading", "post-para"},
	},
}

// legalHref ports legal/[slug]/content.ts legalHref.
func legalHref(slug content.LegalSlug) string { return "/legal/" + string(slug) }

// formatLegalDate ports formatLegalDate: "2026-09-02" is "September 2, 2026", read in UTC.
func formatLegalDate(iso string) string {
	t, err := time.Parse(time.DateOnly, iso)
	if err != nil {
		return iso
	}
	return t.Format("January 2, 2006")
}

// legalBlock is one heading or paragraph of the flattened article.
type legalBlock struct {
	heading bool
	text    string
}

// flattenLegal splits a document into the run before its bullet list, the list, and the run
// after (see the note in legal.html). A document carries at most one list; the content tests
// hold it to that.
func flattenLegal(doc content.LegalDoc) (pre []legalBlock, bullets []string, post []legalBlock) {
	out := &pre
	for _, sec := range doc.Sections {
		*out = append(*out, legalBlock{heading: true, text: sec.Heading})
		for _, p := range sec.Paragraphs {
			*out = append(*out, legalBlock{text: p})
		}
		if len(sec.Bullets) > 0 && bullets == nil {
			bullets = sec.Bullets
			out = &post
		}
	}
	return pre, bullets, post
}

func fillLegalBlocks(d *page.Doc, repeat, prefix string, blocks []legalBlock) {
	d.Repeat(repeat, len(blocks), func(i int, r *page.Row) {
		if blocks[i].heading {
			r.Text(prefix+"-heading", blocks[i].text)
			r.Remove(prefix + "-para")
		} else {
			r.Text(prefix+"-para", blocks[i].text)
			r.Remove(prefix + "-heading")
		}
	})
}

func (s *site) legal(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := content.LegalSlug(r.PathValue("slug"))
		doc, ok := s.cat.LegalDoc(slug)
		if !ok {
			s.notFound(w, r)
			return
		}
		path := legalHref(slug)
		d := tmpl.New()
		s.chrome(d, path)
		s.head(d, meta{Title: doc.Title, Description: doc.Description, Path: path})

		slugs := s.cat.LegalSlugs()
		d.Repeat("aside", len(slugs), func(i int, row *page.Row) {
			other, _ := s.cat.LegalDoc(slugs[i])
			row.URL("aside-link", "href", legalHref(slugs[i]))
			row.Text("aside-title", other.Title)
			if slugs[i] == slug {
				row.Class("aside-link", "legal-aside-selected", true)
				row.Attr("aside-link", "aria-current", "page")
			}
		})
		d.Repeat("chip", len(slugs), func(i int, row *page.Row) {
			other, _ := s.cat.LegalDoc(slugs[i])
			row.URL("chip-link", "href", legalHref(slugs[i]))
			row.Text("chip-label", other.NavLabel)
			if slugs[i] == slug {
				row.Class("chip-link", "chip-secondary", true)
				row.Attr("chip-link", "aria-current", "page")
			} else {
				row.Class("chip-link", "chip-outlined", true)
			}
		})

		d.Text("title", doc.Title)
		d.Attr("updated", "datetime", doc.LastUpdated)
		d.Text("updated", formatLegalDate(doc.LastUpdated))
		if doc.Status != "reviewed" {
			d.Keep("draft")
		} else {
			d.Remove("draft")
		}

		pre, bullets, post := flattenLegal(doc)
		fillLegalBlocks(d, "legal-pre", "pre", pre)
		if len(bullets) > 0 {
			d.Keep("legal-list")
			d.Repeat("legal-bullet", len(bullets), func(i int, row *page.Row) { row.Text("bullet", bullets[i]) })
		} else {
			d.Remove("legal-list")
		}
		fillLegalBlocks(d, "legal-post", "post", post)
		s.render(w, d)
	}
}
