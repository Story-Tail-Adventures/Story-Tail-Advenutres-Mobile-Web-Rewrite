// Package public serves the public pages: Screen Inventory §2.0 (landing, topic pages, explore, How it works, legal, the lead and join forms). Docs/GO-MIGRATION.md Phase 2.
//
// Mount public pages with rt.Public, and the landing page with rt.FrontDoor. They read no cookie and call no Supabase (§4.7), except explore results and hotel search, and render with web.Shared. Layout: shell.PublicHero or shell.PublicPlain, filled with shell.FillPublic.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/public/, page-only styles in
// webgo/assets/css/area/public.css. Nothing outside those three places needs an edit.
package public

import (
	"errors"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this area fills. The server loads them with the rest at startup.
var Specs = []page.Spec{
	landingSpec,
	howItWorksSpec,
	legalSpec,
	caribbeanSpec,
	cruisesSpec,
	honeymoonsSpec,
	aboutSpec,
	exploreSpec,
	tripSpec,
	notFoundSpec,
}

// Mount registers this area's routes. It runs once at startup; take templates from
// d.Pages here, so a missing page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	s := &site{Deps: d, cat: content.Get()}
	var errs []error
	tmpl := func(spec page.Spec) *page.Template {
		t, err := d.Pages.Template(spec.File)
		if err != nil {
			errs = append(errs, err)
		}
		return t
	}
	landing := tmpl(landingSpec)
	howItWorks := tmpl(howItWorksSpec)
	legal := tmpl(legalSpec)
	caribbean := tmpl(caribbeanSpec)
	cruises := tmpl(cruisesSpec)
	honeymoons := tmpl(honeymoonsSpec)
	about := tmpl(aboutSpec)
	explore := tmpl(exploreSpec)
	trip := tmpl(tripSpec)
	s.notFoundPage = tmpl(notFoundSpec)
	if err := errors.Join(errs...); err != nil {
		return err
	}

	// The front door: a signed-in visitor goes to /dashboard (gate.RedirectFor).
	rt.FrontDoor(s.landing(landing))
	rt.Public("GET /how-it-works", s.howItWorks(howItWorks))
	rt.Public("GET /legal/{slug}", s.legal(legal))
	rt.Public("GET /caribbean", s.caribbean(caribbean))
	rt.Public("GET /cruises", s.cruises(cruises))
	rt.Public("GET /honeymoons", s.honeymoons(honeymoons))
	rt.Public("GET /about", s.about(about))
	rt.Public("GET /explore", s.explore(explore))
	rt.Public("GET /explore/{slug}", s.trip(trip))
	rt.Public("GET /sitemap.xml", s.sitemap())
	rt.Public("GET /robots.txt", s.robots())
	return nil
}
