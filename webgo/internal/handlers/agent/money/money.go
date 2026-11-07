// Package money is the agent workspace's money and admin sub-area (docs/GO-MIGRATION.md Phase 5), built by
// its own session. Routes (port each from web/app/(agent)/agent/...):
//
//	/agent/commission, .../forecast, .../import, .../import/{importId},
//	/agent/commission/ledger, .../ledger/new, .../ledger/{commissionId},
//	and the CSV route /agent/commission/ledger/export;
//	/agent/reports and .../{clients,destinations,export,funnel,leads,pipeline,revenue,suppliers},
//	and the route /agent/reports/download; /agent/settings.
//
// Everything here is rt.Protected. Before rendering, do what the (agent) layout does:
// shell.LoadStatus + shell.AgentDecision (a null status or a client goes to /dashboard),
// shell.AgentMFARedirect, initials via shell.AgentInitials; fill shell.Agent with
// shell.FillAgent; render with web.Private. Reads go through agentread.Call; writes through
// d.API.Call, mapped with web.FromResult.
//
// This sub-area owns only: this package, webgo/pages/agent/money/, and
// webgo/assets/css/area/agent/money.css. The agent package wires it in already.
package money

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this sub-area fills (files under pages/agent/money/).
var Specs = []page.Spec{}

// Mount registers this sub-area's routes. Take templates from d.Pages here, so a missing
// page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	_, _ = rt, d
	return nil
}
