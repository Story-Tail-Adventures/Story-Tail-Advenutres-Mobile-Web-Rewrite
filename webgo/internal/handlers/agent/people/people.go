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
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// The two state pages every handler here can end on (guard.go).
var (
	noAccessSpec = page.Spec{File: "agent/people/no-access.html", Layout: shell.Agent}
	failedSpec   = page.Spec{File: "agent/people/failed.html", Layout: shell.Agent, Slots: []string{"retry", "home"}}
)

// Specs declares every page this sub-area fills (files under pages/agent/people/).
var Specs = []page.Spec{
	noAccessSpec, failedSpec, worklistSpec, calendarSpec,
	clientsSpec, clientNewSpec, clientEditSpec, notFoundSpec,
}

// Mount registers this sub-area's routes. Templates are taken here, so a missing page stops
// the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	a := &app{d: d}
	for _, t := range []struct {
		spec page.Spec
		into **page.Template
	}{
		{noAccessSpec, &a.noAccess}, {failedSpec, &a.failed},
		{worklistSpec, &a.worklist}, {calendarSpec, &a.calendar},
		{clientsSpec, &a.clients}, {clientNewSpec, &a.clientNew}, {clientEditSpec, &a.clientEdit},
		{notFoundSpec, &a.notFound},
	} {
		tmpl, err := d.Pages.Template(t.spec.File)
		if err != nil {
			return fmt.Errorf("people: %w", err)
		}
		*t.into = tmpl
	}

	rt.Protected("GET /agent", http.HandlerFunc(a.serveWorklist))
	rt.Protected("GET /agent/calendar", http.HandlerFunc(a.serveCalendar))
	rt.Protected("GET /agent/clients", http.HandlerFunc(a.serveClients))
	rt.Protected("POST /agent/clients", http.HandlerFunc(a.postClients))
	rt.Protected("GET /agent/clients/new", http.HandlerFunc(a.serveNewClient))
	rt.Protected("POST /agent/clients/new", http.HandlerFunc(a.postNewClient))
	rt.Protected("GET /agent/clients/{clientId}/edit", http.HandlerFunc(a.serveEditClient))
	rt.Protected("POST /agent/clients/{clientId}/edit", http.HandlerFunc(a.postEditClient))
	return nil
}
