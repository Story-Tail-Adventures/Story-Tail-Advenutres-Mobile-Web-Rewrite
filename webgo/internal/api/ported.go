package api

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/cruisesearch"
)

// portTable lists every function that runs in Go, with the gate its Deno original had
// (config.toml's verify_jwt, the cron jobs, the web-only search). A known name that is not
// here passes through to Supabase. Add a row in the PR that ports the function, never
// before its differential test passes (docs/GO-MIGRATION.md §5.9).
func portTable() map[string]port {
	return map[string]port{
		// Search (§5.9 step 2). hotel-search is retired, not ported: web hotel search moved
		// into the web app (PR #48) and nothing calls the function (GO-MIGRATION.md §5.9).
		"cruise-search": {GateInProcess, cruisesearch.Func},
	}
}
