// Package agent serves the advisor's workspace: Screen Inventory §3 (worklist, pipeline, calendar, clients, trips, leads, messages, templates, commission, reports, settings, the CSV exports). Docs/GO-MIGRATION.md Phase 5.
//
// Mount with rt.Protected. Before rendering, port the (agent) layout's checks: shell.LoadStatus and shell.AgentDecision (a null status or a client goes to /dashboard), then shell.AgentMFARedirect(st.AAL2, st.HasFactor), then the initials from platform_user.display_name (shell.AgentInitials). Layout: shell.Agent, filled with shell.FillAgent. Render with web.Private.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/agent/, page-only styles in
// webgo/assets/css/area/agent.css. Nothing outside those three places needs an edit.
package agent

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
