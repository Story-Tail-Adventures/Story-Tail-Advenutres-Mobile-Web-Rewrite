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
// shell.FillAgent; render with web.Private. That is frame.go's begin + fillFrame. Reads go
// through agentread.Call; writes through d.API.Call, mapped with web.FromResult.
//
// This sub-area owns only: this package, webgo/pages/agent/money/, and
// webgo/assets/css/area/agent/money.css. The agent package wires it in already.
package money

import (
	"fmt"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this sub-area fills (files under pages/agent/money/).
var Specs = []page.Spec{dashboardSpec, ledgerSpec, forecastSpec}

// app is this sub-area's handlers and the templates they fill.
type app struct {
	d         handlers.Deps
	dashboard *page.Template
	ledger    *page.Template
	forecast  *page.Template
}

// Mount registers this sub-area's routes. Take templates from d.Pages here, so a missing
// page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	a := &app{d: d}
	for _, t := range []struct {
		spec page.Spec
		into **page.Template
	}{
		{dashboardSpec, &a.dashboard},
		{ledgerSpec, &a.ledger},
		{forecastSpec, &a.forecast},
	} {
		tmpl, err := d.Pages.Template(t.spec.File)
		if err != nil {
			return fmt.Errorf("money: %w", err)
		}
		*t.into = tmpl
	}

	rt.Protected("GET /agent/commission", http.HandlerFunc(a.serveDashboard))
	rt.Protected("GET /agent/commission/ledger", http.HandlerFunc(a.serveLedger))
	rt.Protected("GET /agent/commission/ledger/export", http.HandlerFunc(a.serveLedgerExport))
	// More specific than the GET pattern, which would otherwise answer a HEAD by running it.
	rt.Protected("HEAD /agent/commission/ledger/export", http.HandlerFunc(serveExportHead))
	rt.Protected("GET /agent/commission/forecast", http.HandlerFunc(a.serveForecast))
	rt.Protected("POST /agent/commission/forecast", http.HandlerFunc(a.saveWeights))
	return nil
}
