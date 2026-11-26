// Package styleguide is the development-only /_styleguide: every ui.css class in both
// schemes, and each layout filled with a sample page, so the sessions building pages can
// check their markup against the shared look (docs/GO-MIGRATION.md §4.8). Mounted only when
// STA_ENV=development.
package styleguide

import (
	"log/slog"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// preview is one layout shown with a sample page, filled the way a real page fills it.
type preview struct {
	name   string
	layout *page.Layout
	fill   func(d *page.Doc)
}

// The sample flash shows the snackbar on the shells that take one.
const sampleFlash = "Your changes are saved."

var previews = []preview{
	{"public-hero", shell.PublicHero, func(d *page.Doc) {
		shell.FillPublic(d, "/caribbean", shell.PublicChrome{PlaceholderBanner: true})
	}},
	{"public-plain", shell.PublicPlain, func(d *page.Doc) {
		shell.FillPublic(d, "/explore", shell.PublicChrome{PlaceholderBanner: true})
	}},
	{"auth", shell.Auth, func(d *page.Doc) { shell.FillAuth(d, sampleFlash) }},
	{"onboarding", shell.Onboarding, func(d *page.Doc) { shell.FillOnboarding(d, "") }},
	{"client", shell.Client, func(d *page.Doc) {
		shell.FillClient(d, "/dashboard", shell.Chrome{Initials: shell.InitialsFor("Jordan", "Rivers"), Flash: sampleFlash})
	}},
	{"agent", shell.Agent, func(d *page.Doc) {
		shell.FillAgent(d, "/agent/clients", shell.Chrome{Initials: shell.AgentInitials("Gyasi Story"), Flash: sampleFlash})
	}},
}

// Specs are the styleguide page and one sample per layout.
var Specs = func() []page.Spec {
	out := []page.Spec{{File: "dev/styleguide.html"}}
	for _, p := range previews {
		out = append(out, page.Spec{File: "dev/sample-" + p.name + ".html", Layout: p.layout})
	}
	return out
}()

// Mount registers /_styleguide and /_styleguide/layout/{name}.
func Mount(rt *gate.Router, set *page.Set, log *slog.Logger) error {
	guide, err := set.Template("dev/styleguide.html")
	if err != nil {
		return err
	}
	rt.Public("GET /_styleguide", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		web.Render(w, log, guide.New(), http.StatusOK, web.Private)
	}))
	for _, p := range previews {
		tmpl, err := set.Template("dev/sample-" + p.name + ".html")
		if err != nil {
			return err
		}
		rt.Public("GET /_styleguide/layout/"+p.name, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			d := tmpl.New()
			p.fill(d)
			web.Render(w, log, d, http.StatusOK, web.Private)
		}))
	}
	return nil
}
