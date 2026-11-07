// Package agent serves the advisor's workspace: Screen Inventory §3. Docs/GO-MIGRATION.md
// Phase 5.
//
// It is built by three sessions at once, so it is split into sub-areas, each its own
// package with its own pages folder and stylesheet, and this file only joins them:
//
//   - people: worklist home, calendar, clients, leads, messages and message templates
//   - trips:  trips (detail tabs, builder, itinerary, payments), pipeline, trip templates
//   - money:  commission, reports, settings, and the two CSV routes
//
// Every sub-area reads through agentread (the one door over the 67 named reads) and
// renders with the agent layout (shell.Agent / shell.FillAgent). A sub-area never edits
// another's files or this one.
package agent

import (
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/money"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/people"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/agent/trips"
)

// Specs declares every page the agent area fills: the three sub-areas' pages together. The
// server loads them with the rest at startup.
var Specs = slices.Concat(people.Specs, trips.Specs, money.Specs)

// Mount registers every agent route, sub-area by sub-area.
func Mount(rt *gate.Router, d handlers.Deps) error {
	for _, m := range []func(*gate.Router, handlers.Deps) error{people.Mount, trips.Mount, money.Mount} {
		if err := m(rt, d); err != nil {
			return err
		}
	}
	return nil
}
