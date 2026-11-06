// Package caller holds AuthContext from supabase/functions/_shared/auth.ts and the checks
// that need nothing but it: requireRole and requireRecentMfa.
//
// Who the caller is gets decided in internal/api/edge (a GoTrue /auth/v1/user call, then
// the platform_user row). This package only holds the answer, so domain code that branches on
// the caller's role (requireClientId, requireAgentId) can be tested without a network.
package caller

import (
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Roles, as the user_role enum spells them.
const (
	RoleClient = "client"
	RoleAgent  = "agent"
	RoleAdmin  = "admin"
)

// Context is AuthContext.
type Context struct {
	// AccountID is auth.users.id, which IS public.account.id (Data-Model §5.1.1).
	AccountID      string
	PlatformUserID string
	Role           string
	AgentID        *string
	ClientID       *string
	// AAL is "aal1" (password only) or "aal2" (a second factor was verified).
	AAL string
	// SecondFactorAt is when a SECOND factor was last verified, from the token's amr
	// claim. Nil when none.
	SecondFactorAt *time.Time
	// IP and UserAgent go onto audit_event rows. Nil when the request had none.
	IP        *string
	UserAgent *string
}

// RequireRole is requireRole: 403 unless the caller holds one of the roles.
func RequireRole(c *Context, roles ...string) error {
	for _, r := range roles {
		if c.Role == r {
			return nil
		}
	}
	return problem.Forbidden("Requires role: " + strings.Join(roles, " or ") + ".")
}

// RequireRecentMfa is requireRecentMfa: a SECOND FACTOR VERIFIED RECENTLY, not merely
// enrolled. "Has MFA enrolled" is true forever once set up; "was challenged in the last 15
// minutes" is what protects a sensitive action from a stolen session. maxAgeSeconds is 900
// where the Deno callers passed nothing.
func RequireRecentMfa(c *Context, maxAgeSeconds float64, now time.Time) error {
	if c.AAL != "aal2" {
		return problem.Forbidden("This action requires multi-factor authentication.")
	}
	if c.SecondFactorAt == nil {
		// Fail closed: aal2 without a datable second-factor entry cannot prove freshness.
		return problem.Forbidden("Could not determine when MFA was last verified.")
	}
	age := float64(now.Sub(*c.SecondFactorAt).Milliseconds()) / 1000
	if age > maxAgeSeconds {
		return problem.Forbidden("MFA was verified " + js.NumberString(js.Round(age)) +
			"s ago; this action requires it within " + js.NumberString(maxAgeSeconds) + "s.")
	}
	return nil
}
