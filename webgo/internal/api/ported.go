package api

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/accountadmin"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentclient"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentclientnotes"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentcommission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentitinerary"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentlead"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentmessagetemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentreport"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentsettings"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttrip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttripnotes"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttripstatus"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/commissionimport"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/cruisesearch"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/leadmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingcompanions"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingconnect"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingpreferences"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingprofile"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingstep"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/quoterequest"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/testimonial"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripdocument"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripdocumenturl"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripmessage"
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

		// Traveler trip (step 5). trip-message, trip-document-url and testimonial are
		// mobile-called.
		"trip-message":      {GateUser, tripmessage.Func},
		"trip-document":     {GateUser, tripdocument.Func},
		"trip-document-url": {GateUser, tripdocumenturl.Func},
		"testimonial":       {GateUser, testimonial.Func},
		"quote-request":     {GateUser, quoterequest.Func},

		// Trips and pay links (step 7). Pay links are https only, advisor only, and audited
		// in SQL in the same transaction as the write.
		"agent-trip":        {GateUser, agenttrip.Func},
		"agent-trip-status": {GateUser, agenttripstatus.Func},
		"agent-trip-notes":  {GateUser, agenttripnotes.Func},
		"agent-itinerary":   {GateUser, agentitinerary.Func},

		// Advisor clients, notes, templates, settings and messages (step 6). agent-message
		// and agent-settings are mobile-called.
		"agent-client":           {GateUser, agentclient.Func},
		"agent-client-notes":     {GateUser, agentclientnotes.Func},
		"agent-template":         {GateUser, agenttemplate.Func},
		"agent-message-template": {GateUser, agentmessagetemplate.Func},
		"agent-settings":         {GateUser, agentsettings.Func},
		"agent-message":          {GateUser, agentmessage.Func},

		// Commission (step 8). Ledger writes are audited inside their SQL transaction.
		"agent-commission":  {GateUser, agentcommission.Func},
		"commission-import": {GateUser, commissionimport.Func},

		// Reports (step 9).
		"agent-report": {GateUser, agentreport.Func},

		// Account admin (step 10): GoTrue admin calls behind a recent second factor.
		"account-admin": {GateUser, accountadmin.Func},
	}
}
