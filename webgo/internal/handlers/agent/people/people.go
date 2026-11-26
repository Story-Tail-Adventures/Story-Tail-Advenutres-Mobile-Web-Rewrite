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
	clientsSpec, clientNewSpec, clientEditSpec, notFoundSpec, clientDetailSpec, mergeSpec,
	leadsSpec, leadSpec, leadNewSpec, leadNotFoundSpec, messagesSpec,
	templatesSpec, templateEditorSpec, templateNotFoundSpec,
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
		{notFoundSpec, &a.notFound}, {clientDetailSpec, &a.clientDetail}, {mergeSpec, &a.merge},
		{leadsSpec, &a.leads}, {leadSpec, &a.lead}, {leadNewSpec, &a.leadNew}, {leadNotFoundSpec, &a.leadNotFound},
		{messagesSpec, &a.messages},
		{templatesSpec, &a.templates}, {templateEditorSpec, &a.templateEditor},
		{templateNotFoundSpec, &a.templateNotFound},
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
	rt.Protected("GET /agent/clients/{clientId}", http.HandlerFunc(a.serveClientDetail))
	rt.Protected("POST /agent/clients/{clientId}/notes", http.HandlerFunc(a.postClientNote))
	rt.Protected("POST /agent/clients/{clientId}/archive", http.HandlerFunc(a.postClientArchive))
	rt.Protected("POST /agent/clients/{clientId}/account", http.HandlerFunc(a.postClientAccount))
	rt.Protected("GET /agent/clients/{clientId}/merge", http.HandlerFunc(a.serveMerge))
	rt.Protected("POST /agent/clients/{clientId}/merge", http.HandlerFunc(a.postMerge))
	rt.Protected("GET /agent/leads", http.HandlerFunc(a.serveLeads))
	rt.Protected("GET /agent/leads/new", http.HandlerFunc(a.serveNewLead))
	rt.Protected("POST /agent/leads/new", http.HandlerFunc(a.postNewLead))
	rt.Protected("GET /agent/leads/{leadId}", http.HandlerFunc(a.serveLead))
	rt.Protected("POST /agent/leads/{leadId}", http.HandlerFunc(a.postLead))
	rt.Protected("GET /agent/messages", http.HandlerFunc(a.serveMessages))
	rt.Protected("POST /agent/messages", http.HandlerFunc(a.postMessages))
	// A literal segment beats a wildcard one in ServeMux, so these are reached before
	// /agent/messages/{conversationId} ever sees them.
	rt.Protected("GET /agent/messages/templates", http.HandlerFunc(a.serveTemplates))
	rt.Protected("POST /agent/messages/templates", http.HandlerFunc(a.postTemplates))
	rt.Protected("GET /agent/messages/templates/new", http.HandlerFunc(a.serveNewTemplate))
	rt.Protected("POST /agent/messages/templates/new", http.HandlerFunc(a.postNewTemplate))
	rt.Protected("GET /agent/messages/templates/{templateId}", http.HandlerFunc(a.serveTemplate))
	rt.Protected("POST /agent/messages/templates/{templateId}", http.HandlerFunc(a.postExistingTemplate))
	rt.Protected("GET /agent/messages/new", http.HandlerFunc(a.serveNewMessage))
	rt.Protected("POST /agent/messages/new", http.HandlerFunc(a.postNewMessage))
	rt.Protected("GET /agent/messages/{conversationId}", http.HandlerFunc(a.serveThread))
	rt.Protected("POST /agent/messages/{conversationId}", http.HandlerFunc(a.postThread))
	rt.SelfGated("POST /api/agent/messages/{conversationId}/read", http.HandlerFunc(a.postThreadRead))
	rt.SelfGated("GET /api/agent/messages/count", http.HandlerFunc(a.serveMessageCount))
	return nil
}
