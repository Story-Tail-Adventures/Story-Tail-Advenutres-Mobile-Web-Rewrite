package public

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.0.2, How it works (/how-it-works). Ports app/(public)/(plain)/how-it-works/page.tsx.

var howItWorksSpec = page.Spec{
	File:    "public/how-it-works.html",
	Layout:  shell.PublicPlain,
	Slots:   advisorBioSlots,
	Repeats: faqRepeat(),
}

func (s *site) howItWorks(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := tmpl.New()
		s.chrome(d, "/how-it-works")
		s.head(d, meta{
			Title:       "How it works",
			Description: "You ask. We plan together. You go and rest. No planning fees, ever — Story-Tail earns commission from suppliers, not from you.",
			Path:        "/how-it-works",
			Image:       "turks",
		})
		fillAdvisorBio(d, s.cat)
		fillFAQ(d, s.cat.HowItWorksFAQ)
		s.render(w, d)
	}
}
