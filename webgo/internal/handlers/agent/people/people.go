// Package people is the agent workspace's people sub-area (docs/GO-MIGRATION.md Phase 5), built by
// its own session. Routes (port each from web/app/(agent)/agent/...):
//
//	/agent (worklist home), /agent/calendar,
//	/agent/clients, /agent/clients/new, /agent/clients/{clientId}, .../edit, .../merge,
//	/agent/leads, /agent/leads/new, /agent/leads/{leadId},
//	/agent/messages (list + thread, the @list parallel route as one two-column page),
//	/agent/messages/new, /agent/messages/{conversationId},
//	/agent/messages/templates, .../new, .../{templateId},
//	and the route handler /api/agent/messages/{conversationId}/read.
//
// Everything here is rt.Protected. Before rendering, do what the (agent) layout does:
// shell.LoadStatus + shell.AgentDecision (a null status or a client goes to /dashboard),
// shell.AgentMFARedirect, initials via shell.AgentInitials; fill shell.Agent with
// shell.FillAgent; render with web.Private. Reads go through agentread.Call; writes through
// d.API.Call, mapped with web.FromResult.
//
// This sub-area owns only: this package, webgo/pages/agent/people/, and
// webgo/assets/css/area/agent/people.css. The agent package wires it in already.
package people

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this sub-area fills (files under pages/agent/people/).
var Specs = []page.Spec{}

// Mount registers this sub-area's routes. Take templates from d.Pages here, so a missing
// page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	_, _ = rt, d
	return nil
}
