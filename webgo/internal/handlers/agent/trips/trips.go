// Package trips is the agent workspace's trips sub-area (docs/GO-MIGRATION.md Phase 5), built by
// its own session. Routes (port each from web/app/(agent)/agent/...):
//
//	/agent/trips, /agent/trips/new, /agent/trips/{tripId} (Trip Detail, one URL per tab),
//	/agent/trips/{tripId}/builder, .../itinerary, .../payments, .../payments/history,
//	/agent/pipeline (the 409 optimistic lock), /agent/templates (trip templates, §3.4.13).
//
// Everything here is rt.Protected. Before rendering, do what the (agent) layout does:
// shell.LoadStatus + shell.AgentDecision (a null status or a client goes to /dashboard),
// shell.AgentMFARedirect, initials via shell.AgentInitials; fill shell.Agent with
// shell.FillAgent; render with web.Private. Reads go through agentread.Call; writes through
// d.API.Call, mapped with web.FromResult.
//
// This sub-area owns only: this package, webgo/pages/agent/trips/, and
// webgo/assets/css/area/agent/trips.css. The agent package wires it in already.
package trips

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this sub-area fills (files under pages/agent/trips/).
var Specs = []page.Spec{}

// Mount registers this sub-area's routes. Take templates from d.Pages here, so a missing
// page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	_, _ = rt, d
	return nil
}
