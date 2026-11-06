// Package auth serves the sign-in screens: Screen Inventory §2.1.1 to §2.1.8 (login, register, forgot and reset password, verify email, MFA challenge and setup, link account, /auth/callback, /auth/confirm). Docs/GO-MIGRATION.md Phase 3.
//
// Mount with rt.AuthOnly (login, register, forgot-password), rt.MFAChallengeRoute (/login/mfa), rt.Protected (/mfa/...) or rt.Public (reset-password, verify-email, link-account; see gate.go for why). Layout: shell.Auth, filled with shell.FillAuth. Copy: web.AuthError and web.MapAuthError. The dev-only devauth harness mounts GET/POST /login, GET /dashboard and POST /account/sign-out; it skips any of those this package mounts first.
//
// This package is the whole of the area's Go: add each page's page.Spec to Specs and its
// routes to Mount. Pages live in webgo/pages/auth/, page-only styles in
// webgo/assets/css/area/auth.css. Nothing outside those three places needs an edit.
package auth

import (
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// Specs declares every page this area fills. The server loads them with the rest at startup.
var Specs = []page.Spec{}

// Mount registers this area's routes. It runs once at startup; take templates from
// d.Pages here, so a missing page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	_, _ = rt, d
	return nil
}
