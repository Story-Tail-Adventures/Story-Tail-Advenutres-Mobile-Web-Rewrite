package api

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentlead"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/cruisesearch"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/leadmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingcompanions"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingconnect"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingpreferences"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingprofile"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingstep"
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

		// Leads (step 3).
		"lead-message": {GateOpen, leadmessage.Func},
		"agent-lead":   {GateUser, agentlead.Func},

		// Onboarding (step 4). All five are mobile-called.
		"onboarding-step":        {GateUser, onboardingstep.Func},
		"onboarding-profile":     {GateUser, onboardingprofile.Func},
		"onboarding-preferences": {GateUser, onboardingpreferences.Func},
		"onboarding-companions":  {GateUser, onboardingcompanions.Func},
		"onboarding-connect":     {GateUser, onboardingconnect.Func},
	}
}
