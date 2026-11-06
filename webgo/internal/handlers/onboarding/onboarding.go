// Package onboarding serves the first-run wizard: Screen Inventory §2.1.9 to §2.1.14 (/welcome, /onboarding/...). Docs/GO-MIGRATION.md Phase 4.
//
// Mount with rt.Protected. Before rendering: shell.LoadStatus, then shell.OnboardingDecision (somebody who has finished, or who is not a client, goes to /dashboard). Layout: shell.Onboarding, filled with shell.FillOnboarding. Render with web.Private.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/onboarding/, page-only styles in
// webgo/assets/css/area/onboarding.css. Nothing outside those three places needs an edit.
package onboarding

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
