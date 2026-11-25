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
var Specs = []page.Spec{
	dashboardSpec, ledgerSpec, forecastSpec, lineSpec, addSpec, importSpec, statementSpec, resolveSpec,
	reportsHubSpec, revenueSpec, suppliersSpec, destinationsSpec, clientsSpec, funnelSpec, pipelineSpec,
	exportCenterSpec, leadsSpec,
}

// app is this sub-area's handlers and the templates they fill.
type app struct {
	d         handlers.Deps
	dashboard *page.Template
	ledger    *page.Template
	forecast  *page.Template
	line      *page.Template
	add       *page.Template
	// importPage is the statement list; statementPage is one statement at either stage.
	importPage    *page.Template
	statementPage *page.Template
	resolvePage   *page.Template
	// §3.11's nine: the hub and the eight reports.
	reportsHub   *page.Template
	revenue      *page.Template
	suppliers    *page.Template
	destinations *page.Template
	clientValue  *page.Template
	funnel       *page.Template
	pipeline     *page.Template
	exportCenter *page.Template
	leads        *page.Template
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
		{lineSpec, &a.line},
		{addSpec, &a.add},
		{importSpec, &a.importPage},
		{statementSpec, &a.statementPage},
		{resolveSpec, &a.resolvePage},
		{reportsHubSpec, &a.reportsHub},
		{revenueSpec, &a.revenue},
		{suppliersSpec, &a.suppliers},
		{destinationsSpec, &a.destinations},
		{clientsSpec, &a.clientValue},
		{funnelSpec, &a.funnel},
		{pipelineSpec, &a.pipeline},
		{exportCenterSpec, &a.exportCenter},
		{leadsSpec, &a.leads},
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
	// More specific than {commissionId}, which would otherwise swallow both of these.
	rt.Protected("GET /agent/commission/ledger/new", http.HandlerFunc(a.serveAddLine))
	rt.Protected("POST /agent/commission/ledger/new", http.HandlerFunc(a.postAddLine))
	rt.Protected("GET /agent/commission/ledger/{commissionId}", http.HandlerFunc(a.serveLine))
	rt.Protected("POST /agent/commission/ledger/{commissionId}", http.HandlerFunc(a.saveLine))
	rt.Protected("GET /agent/commission/import", http.HandlerFunc(a.serveImport))
	rt.Protected("POST /agent/commission/import", http.HandlerFunc(a.uploadStatement))
	rt.Protected("GET /agent/commission/import/{importId}", http.HandlerFunc(a.serveStatement))
	rt.Protected("POST /agent/commission/import/{importId}", http.HandlerFunc(a.saveStatement))
	rt.Protected("GET /agent/commission/import/{importId}/rows/{rowId}", http.HandlerFunc(a.serveResolve))
	rt.Protected("POST /agent/commission/import/{importId}/rows/{rowId}", http.HandlerFunc(a.resolveRow))

	// §3.11 Reporting. `/download` is the audited CSV; `/export` is the Export Center page,
	// so the two never collide.
	rt.Protected("GET /agent/reports", http.HandlerFunc(a.serveReportsHub))
	rt.Protected("GET /agent/reports/download", http.HandlerFunc(a.serveReportDownload))
	// More specific than the GET pattern, which would otherwise answer a HEAD by running
	// it: an audited export with the body thrown away.
	rt.Protected("HEAD /agent/reports/download", http.HandlerFunc(serveExportHead))
	rt.Protected("GET /agent/reports/revenue", http.HandlerFunc(a.serveRevenue))
	rt.Protected("GET /agent/reports/suppliers", http.HandlerFunc(a.serveSuppliers))
	rt.Protected("GET /agent/reports/destinations", http.HandlerFunc(a.serveDestinations))
	rt.Protected("GET /agent/reports/clients", http.HandlerFunc(a.serveClientValue))
	rt.Protected("GET /agent/reports/funnel", http.HandlerFunc(a.serveFunnel))
	rt.Protected("GET /agent/reports/pipeline", http.HandlerFunc(a.servePipeline))
	rt.Protected("POST /agent/reports/pipeline", http.HandlerFunc(a.savePipelineWeights))
	rt.Protected("GET /agent/reports/export", http.HandlerFunc(a.serveExportCenter))
	rt.Protected("GET /agent/reports/leads", http.HandlerFunc(a.serveLeadSources))
	return nil
}
