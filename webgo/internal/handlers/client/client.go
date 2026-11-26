// Package client serves the traveler's pages: Screen Inventory §2.2 to §2.6 (dashboard, trips, itinerary, documents, messages, account). Docs/GO-MIGRATION.md Phase 4.
//
// Mount with rt.Protected. Before rendering, port the (client) layout's checks with the shared helpers: shell.LoadStatus, then shell.OnboardingRedirect and shell.ClientDecision (an agent is redirected, an admin sees the unauthorized state). Layout: shell.Client, filled with shell.FillClient(d, r.URL.Path, shell.Chrome{Initials: ..., Flash: web.TakeFlash(...)}). Render with web.Private.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/client/, page-only styles in
// webgo/assets/css/area/client.css. Nothing outside those three places needs an edit.
package client

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
