// Package onboardingstep ports supabase/functions/onboarding-step: the onboarding wizard's
// cursor, Screen Inventory §2.1.9 through §2.1.14.
//
// Two callers, two meanings:
//
//	{ step: "profile" }   2.1.9's "Get started": the wizard has begun, resume here
//	{ complete: true }    2.1.9's "Skip the tour" AND 2.1.14's "Continue to my dashboard"
//
// Skipping and finishing are the same write on purpose: a traveler who declines the wizard
// must not be asked again on every sign-in.
//
// WHY A FUNCTION. platform_user has SELECT-only RLS because it carries `role`; a self-service
// UPDATE policy would let a client make themselves an agent. So the write is the service
// role's.
//
// No audit_event: platform_user is not one of rule 3's sensitive tables and this records a
// UI position, not a change to anyone's data. Invite redemption, which repoints client_id and
// does deserve one, lives in onboarding-connect.
package onboardingstep

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/onboarding"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	// Not for the client id (this writes platform_user) but for the role check: an agent
	// has no onboarding wizard, and moving a cursor that does not exist would corrupt their
	// row.
	if _, err := onboarding.RequireClientID(c); err != nil {
		return nil, err
	}
	body, err := edge.ReadObject(r, edge.ExpectedJSONObject)
	if err != nil {
		return nil, err
	}
	req, err := parse(body)
	if err != nil {
		return nil, err
	}
	now := js.ISOString(d.Now())
	if req.complete {
		if err := guard.AdvanceOnboarding(r.Context(), d.DB, c.PlatformUserID, nil, true, now); err != nil {
			return nil, err
		}
		return edge.OK(js.O("ok", true, "completed", true))
	}
	step := req.step
	if err := guard.AdvanceOnboarding(r.Context(), d.DB, c.PlatformUserID, &step, false, now); err != nil {
		return nil, err
	}
	return edge.OK(js.O("ok", true, "step", step))
}

type request struct {
	complete bool
	step     string
}

// parse reads the body: `complete === true` wins; otherwise a known step, or a 400.
func parse(body js.Value) (request, error) {
	if body.Get("complete").IsTrue() {
		return request{complete: true}, nil
	}
	if !onboarding.IsStep(body.Get("step")) {
		return request{}, problem.BadRequest("Send either a known step or complete: true.")
	}
	s, _ := body.Get("step").Str()
	return request{step: s}, nil
}
