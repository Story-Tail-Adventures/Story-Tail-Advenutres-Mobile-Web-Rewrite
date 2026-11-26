package shell

import (
	"context"
	"log/slog"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// The shell decisions the (client), (onboarding) and (agent) layouts make before they render,
// ported case for case so the three areas share one copy:
//
//   - web/lib/onboarding/status.ts: who the caller is and where their wizard stands
//   - web/lib/agent/role.ts: which shell they belong in, and the agent MFA redirect
//   - web/lib/auth/initials.ts: the avatar's letters
//
// The gate (internal/gate) has already checked the session; these run after it, on the
// visitor's own token, and decide between rendering, redirecting and the unauthorized state.
// The long comments in role.ts (why a null status fails open toward the CLIENT shell, why an
// admin is a third answer, the open §3.1.6 MFA-enrolment gap) apply here unchanged.

// Role is platform_user.role.
type Role string

// The three roles.
const (
	RoleClient Role = "client"
	RoleAgent  Role = "agent"
	RoleAdmin  Role = "admin"
)

// Status is where the signed-in caller stands (OnboardingStatus).
type Status struct {
	Role     Role
	IsClient bool
	// CompletedAt is empty while the wizard is unfinished.
	CompletedAt string
	// Step is the wizard cursor: empty before it starts and after it finishes.
	Step string
}

// asRole falls back to the least privileged shell for a value this code does not know.
func asRole(v string) Role {
	switch Role(v) {
	case RoleAgent, RoleAdmin:
		return Role(v)
	}
	return RoleClient
}

type statusRow struct {
	Role                  string  `json:"role"`
	OnboardingStep        *string `json:"onboarding_step"`
	OnboardingCompletedAt *string `json:"onboarding_completed_at"`
}

// LoadStatus reads the caller's own platform_user row (platform_user_self_select). It
// returns nil when the read fails or finds nothing, and the callers fail OPEN on nil in the
// directions role.go sets out: locking a traveler out of their own dashboard because a read
// timed out is worse than the alternative. Only the error's kind is logged, never the row.
func LoadStatus(ctx context.Context, c *supa.Client, accessToken string, log *slog.Logger) *Status {
	row, found, err := supa.MaybeOne[statusRow](ctx, c, accessToken, "platform_user",
		supa.Q().Select("role,onboarding_step,onboarding_completed_at"))
	if err != nil {
		log.Warn("onboarding status read failed", "err", err)
		return nil
	}
	if !found {
		return nil
	}
	role := asRole(row.Role)
	s := &Status{Role: role, IsClient: role == RoleClient}
	if row.OnboardingCompletedAt != nil {
		s.CompletedAt = *row.OnboardingCompletedAt
	}
	if row.OnboardingStep != nil {
		s.Step = *row.OnboardingStep
	}
	return s
}

// WelcomeRoute is the wizard's cover page (WIZARD_STEPS[0]).
const WelcomeRoute = "/welcome"

// OnboardingRoute maps the wizard cursor to its screen (WIZARD_ROUTE_BY_SLUG,
// lib/onboarding/steps.ts). The cover page has no cursor value.
var OnboardingRoute = map[string]string{
	"profile":     "/onboarding/profile",
	"preferences": "/onboarding/preferences",
	"companions":  "/onboarding/companions",
	"connect":     "/onboarding/connect",
	"complete":    "/onboarding/complete",
}

// OnboardingRedirect is where an unfinished wizard sends someone, or "" to let them through
// (onboardingRedirectFor).
func OnboardingRedirect(s *Status) string {
	if s == nil || !s.IsClient || s.CompletedAt != "" {
		return ""
	}
	if s.Step != "" {
		if r, ok := OnboardingRoute[s.Step]; ok {
			return r
		}
	}
	return WelcomeRoute
}

// The two shells' roots.
const (
	ClientShellRoot = "/dashboard"
	AgentShellRoot  = "/agent"
)

// Kind is a shell decision.
type Kind int

// What a shell does with the caller in front of it.
const (
	Render Kind = iota
	Redirect
	Unauthorized
)

// Decision is a shell decision; To is set for Redirect.
type Decision struct {
	Kind Kind
	To   string
}

// ClientDecision ports clientShellDecision: a null status renders (fails open toward the
// client shell), an agent goes to the worklist, an admin gets the unauthorized state.
func ClientDecision(s *Status) Decision {
	if s == nil {
		return Decision{Kind: Render}
	}
	switch s.Role {
	case RoleAgent:
		return Decision{Kind: Redirect, To: AgentShellRoot}
	case RoleAdmin:
		return Decision{Kind: Unauthorized}
	}
	return Decision{Kind: Render}
}

// AgentDecision ports agentShellDecision: a null status REDIRECTS to the client shell (the
// asymmetry is the security property), a client goes home, an admin is unauthorized.
func AgentDecision(s *Status) Decision {
	if s == nil {
		return Decision{Kind: Redirect, To: ClientShellRoot}
	}
	switch s.Role {
	case RoleAgent:
		return Decision{Kind: Render}
	case RoleAdmin:
		return Decision{Kind: Unauthorized}
	}
	return Decision{Kind: Redirect, To: ClientShellRoot}
}

// OnboardingDecision ports the (onboarding) layout's rule: somebody who has finished, or who
// is not a client, has no business in the wizard.
func OnboardingDecision(s *Status) Decision {
	if s != nil && (!s.IsClient || s.CompletedAt != "") {
		return Decision{Kind: Redirect, To: ClientShellRoot}
	}
	return Decision{Kind: Render}
}

// The MFA screens.
const (
	MFASetupPath     = "/mfa/setup"
	MFAChallengePath = "/login/mfa"
)

// AgentMFARedirect ports agentMfaRedirect: an advisor below aal2 finishes signing in first.
// A factor that this session has not used goes to the challenge; no verified factor goes to
// setup. Pass the session's facts (session.State AAL2 and HasFactor).
func AgentMFARedirect(aal2, hasFactor bool) string {
	if aal2 {
		return ""
	}
	to := MFASetupPath
	if hasFactor {
		to = MFAChallengePath
	}
	return to + "?next=" + url.QueryEscape(AgentShellRoot)
}

// InitialsFallback shows when the name yields nothing (INITIALS_FALLBACK).
const InitialsFallback = "ST"

// The placeholders handle_new_user() writes for a name it does not have. They are not names,
// so they never become initials; filtered per field.
const (
	placeholderFirst = "New"
	placeholderLast  = "Traveler"
)

func firstLetter(v, placeholder string) string {
	t := strings.TrimSpace(v)
	if t == "" || t == placeholder {
		return ""
	}
	for _, r := range t {
		return string(r)
	}
	return ""
}

// InitialsFor ports initialsFor: two letters, or one, or none. Pass preferred_name, falling
// back to first_name, as first.
func InitialsFor(first, last string) string {
	return strings.ToUpper(firstLetter(first, placeholderFirst) + firstLetter(last, placeholderLast))
}

// AgentInitials splits platform_user.display_name on its first space, as the (agent) layout
// does.
func AgentInitials(displayName string) string {
	first, rest, _ := strings.Cut(displayName, " ")
	return InitialsFor(first, rest)
}
