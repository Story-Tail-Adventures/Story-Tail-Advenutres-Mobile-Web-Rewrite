// Package public serves the public pages: Screen Inventory §2.0 (landing, topic pages, explore, How it works, legal, the lead and join forms). Docs/GO-MIGRATION.md Phase 2.
//
// Mount public pages with rt.Public, and the landing page with rt.FrontDoor. They read no cookie and call no Supabase (§4.7), except explore results and hotel search, and render with web.Shared. Layout: shell.PublicHero or shell.PublicPlain, filled with shell.FillPublic.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/public/, page-only styles in
// webgo/assets/css/area/public.css. Nothing outside those three places needs an edit.
package public

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this area fills. The server loads them with the rest at startup.
var Specs = []page.Spec{}

// Mount registers this area's routes. It runs once at startup; take templates from
// d.Pages here, so a missing page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	_, _ = rt, d
	return nil
}
