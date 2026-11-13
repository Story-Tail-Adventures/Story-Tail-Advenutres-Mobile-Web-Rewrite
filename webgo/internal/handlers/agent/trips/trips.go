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
// This sub-area owns only: this package, webgo/pages/agent/trips/,
// webgo/assets/css/area/agent/trips.css and webgo/assets/js/agent/trips/. The agent package
// wires it in already. Assets are served only under content-hashed names, so a module there
// cannot import another: each page loads every module it needs with its own <script>.
//
// How it is laid out: frame.go is the (agent) layout's checks and the four §5 states every
// page shares; format.go is the money, date and status formatting; one file per screen
// holds its reads, its page fill and its writes.
package trips

import (
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this sub-area fills (files under pages/agent/trips/).
var Specs = slices.Concat(listSpecs, newTripSpecs, detailSpecs, builderSpecs, itinerarySpecs, paymentsSpecs, pipelineSpecs, templatesSpecs)

// Mount registers this sub-area's routes. Take templates from d.Pages here, so a missing
// page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	for _, m := range []func(*gate.Router, handlers.Deps) error{mountList, mountNewTrip, mountDetail, mountBuilder, mountItinerary, mountPayments, mountPipeline, mountTemplates} {
		if err := m(rt, d); err != nil {
			return err
		}
	}
	return nil
}

// spec is a page in this sub-area, framed by the agent layout.
func spec(file string, slots []string, repeats map[string][]string) page.Spec {
	return page.Spec{File: file, Layout: agentLayout, Slots: withFrame(slots...), Repeats: repeats}
}
