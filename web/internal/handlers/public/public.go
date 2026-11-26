// Package public serves the public pages: Screen Inventory §2.0 (landing, topic pages, explore, How it works, legal, the lead and join forms). Docs/GO-MIGRATION.md Phase 2.
//
// Mount public pages with rt.Public, and the landing page with rt.FrontDoor. They read no cookie and call no Supabase (§4.7), except explore results and hotel search, and render with web.Shared. Layout: shell.PublicHero or shell.PublicPlain, filled with shell.FillPublic.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in web/pages/public/, page-only styles in
// web/assets/css/area/public.css. Nothing outside those three places needs an edit.
package public

import (
	"errors"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
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
	resultsSpec,
	messageSpec,
	joinSpec,
	unsubscribeSpec,
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
	results := tmpl(resultsSpec)
	message := tmpl(messageSpec)
	join := tmpl(joinSpec)
	unsubscribe := tmpl(unsubscribeSpec)
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
	// Before the slug route on purpose, though ServeMux prefers the literal either way.
	rt.Public("GET /explore/results", s.results(results))
	rt.Public("GET /explore/{slug}", s.trip(trip))
	rt.Public("GET /quote", s.quote())

	// The three forms. None is cacheable: /message posts and calls a function, /join reads
	// the session, and /email/unsubscribe is one person's link.
	rt.Public("GET /message", s.message(message))
	rt.Public("POST /message", s.messagePost(message))
	// The sign-up gate is auth-only: a signed-in visitor is bounced away from it, which is
	// why rt.Public would panic on this path (gate.AuthOnlyPrefixes).
	rt.AuthOnly("GET /join", s.join(join))
	rt.AuthOnly("POST /join", s.joinPost(join))
	rt.Public("GET /email/unsubscribe", s.unsubscribe(unsubscribe))
	rt.Public("POST /email/unsubscribe", s.unsubscribePost())
	rt.Public("GET /sitemap.xml", s.sitemap())
	rt.Public("GET /robots.txt", s.robots())
	return nil
}
