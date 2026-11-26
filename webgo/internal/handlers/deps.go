// Package handlers holds what every area's page handlers share. Each area is its own
// package beside this one (public, auth, client, onboarding, agent), built by its own
// session, and the server wires all five once (internal/server/server.go). An area never
// edits another area's files, this file, or the server: it adds its pages to its own Specs
// and its routes to its own Mount.
package handlers

import (
	"log/slog"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Deps is everything a page handler may use, built once at startup.
type Deps struct {
	// Pages holds every loaded page; take yours with Pages.Template(file) inside Mount, so a
	// missing page fails the boot rather than a request.
	Pages *page.Set
	// Supa reads PostgREST and RPC with the visitor's own token (supa.Select, supa.RPC) and
	// talks to GoTrue. It holds the anon key only.
	Supa *supa.Client
	// Sessions starts and ends sessions (sign-in, sign-out). The gate has already loaded the
	// session for a gated route: read it with session.From(r.Context()).
	Sessions *session.Manager
	// API runs a function for a write, with the visitor's token: API.Call(ctx, name, token, in).
	// Map its result with web.FromResult.
	API *api.Registry
	// Config is the runtime configuration.
	Config config.Config
	// Log never gets a request body, a name, an address, a token or a message text.
	Log *slog.Logger
	// SecureCookies is true outside a local http:// server: pass it to web.SetFlash.
	SecureCookies bool
}
