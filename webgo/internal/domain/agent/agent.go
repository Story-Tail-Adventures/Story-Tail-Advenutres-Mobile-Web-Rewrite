// Package agent ports supabase/functions/_shared/agent.ts: the agent side's counterpart to
// trip.
//
// The §3.x routes serve an agent rather than a traveler, and the two sides need the same two
// guarantees in mirror image: the caller is who they claim to be, and the row they named is
// theirs.
//
// requireAgentId read public.agent through a Db. Here that one read is INJECTED as a
// StatusLookup, so the gate and its tests need no database; the route passes a lookup that
// runs `select status from agent where id = $1` on the service role.
//
// Not ported here (needs the database / network; ported with its function):
//   - agentDb: it was serviceClient() under a name, the place to look when asking what
//     privileges an agent route runs with. The answer still holds: on the service role RLS
//     checks nothing, so every ownership test on this side is explicit, never inherited.
package agent

import (
	"errors"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// MFARequired is AGENT_MFA_REQUIRED, the 403 detail an agent route answers when the session
// has no second factor. Exported because the web and the phone key their "finish signing in"
// path off the status AND this sentence; changing the words is a three-place change.
const MFARequired = "Finish signing in with your authenticator code to open the advisor side."

// StatusLookup reads public.agent.status for one agent id. found is false when there is no
// row (maybeSingle's null). An error is OUR failure: RequireAgentID turns it into a 500.
//
// It must run on the service role: public.agent has no self-read policy for the agent role,
// and an offboarding check that an archived advisor's own RLS could influence would not be a
// check.
type StatusLookup func(agentID string) (status string, found bool, err error)

// RequireAgentID is requireAgentId: the caller's agent id, or 403. A traveler has none and
// does not belong on these routes.
//
// WHY NOT caller.RequireRole(c, "agent"): RequireRole only checks membership in a list. For
// role 'agent' the platform_user CHECK guarantees a non-null agent_id, but its third branch is
// a bare (role = 'admin'), so the moment anyone writes RequireRole(c, "agent", "admin") an
// admin with no agent id walks through. Returning the id, and refusing when there isn't one,
// closes that by construction.
//
// WHY IT READS A ROW: platform_user says WHO the caller is; public.agent says whether that
// advisor is still with the agency. Archiving writes agent.status = 'archived' and nothing
// else, so a context built from platform_user cannot see it. current_agent_id() tests
// a.status <> 'archived' on every read; without the same test here an offboarded advisor
// keeps write access to trips they can no longer see. <> 'archived', NOT = 'active': inactive
// is a paused advisor who must still work their own book. The two must agree; if one moves,
// move both.
//
// AND IT REQUIRES aal2, because agent MFA is required (BRD §11, Data-Model §5.1). Until
// 2026-10-16 a password alone reached every agent route from the phone or curl.
// current_agent_id() makes the same test on the read side. Checked BEFORE the status lookup,
// so an aal1 session learns nothing about the advisor record and costs no database read.
// RequireRecentMfa stays the stricter step-up for the few ops that need a fresh code.
func RequireAgentID(c *caller.Context, lookup StatusLookup) (string, error) {
	if c.Role != caller.RoleAgent || c.AgentID == nil || *c.AgentID == "" {
		return "", problem.Forbidden("This is the advisor's side of the platform.")
	}
	if c.AAL != "aal2" {
		return "", problem.Forbidden(MFARequired)
	}

	status, found, err := lookup(*c.AgentID)
	// A failed lookup is OUR failure, not theirs: a 500, never a quiet pass. Failing open
	// here would restore exactly the hole this read closes. Not wrapped, so no HttpError a
	// lookup might return can turn the 500 into a 4xx.
	if err != nil {
		return "", errors.New("Could not resolve the advisor record: " + err.Error())
	}
	if !found || status == "archived" {
		return "", problem.Forbidden("This advisor account is closed.")
	}
	return *c.AgentID, nil
}

// RequireExpectedVersion is requireExpectedVersion: the expectedVersion a board sends back,
// or a 400.
//
// An integer test alone is not enough: p_expected_version is integer in SQL, so a whole
// number larger than int4 passes the type test, fails the cast inside Postgres (SQLSTATE
// 22003), and reaches the caller as a bodyless 500. The floor is 1: trip.version is NOT NULL
// DEFAULT 1 and only climbs. A version that is merely STALE is still a real version and goes
// through to the 409 where it belongs.
func RequireExpectedVersion(value js.Value) (int64, error) {
	n, ok := value.Num()
	if !ok || !js.IsInteger(n) || n < 1 || n > 2147483647 {
		return 0, problem.BadRequest("Send the expectedVersion the board was rendered from.")
	}
	return int64(n), nil
}

// StageWriteResult is what agent_set_trip_status answers with, narrowed to what the response
// needs.
type StageWriteResult struct {
	Outcome    string `json:"outcome"`
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
	Version    int64  `json:"version"`
}

// knownOutcome is KNOWN_OUTCOMES: every outcome agent_set_trip_status is known to return.
// stale is absent on purpose: the route turns it into a 409 before any body is built.
func knownOutcome(outcome string) bool {
	switch outcome {
	case "changed", "reason_changed", "noop":
		return true
	}
	return false
}

// StageWriteBody is stageWriteBody: the 200 body for a stage write, which has three truthful
// shapes.
//
//   - changed: the stage moved; previousStatus says where from.
//   - reason_changed: the stage did NOT move, but a cancelled trip's reason was corrected.
//     changed stays false, because no history row was written.
//   - noop: nothing to do.
//
// previousStatus is absent from both no-write shapes: nothing was left behind.
//
// cancellationReasonUpdated IS PRESENT ON EVERY cancelled CALL AND ONLY THOSE, and answers
// whether the sentence the caller had to supply reached trip.cancellation_reason: true on
// changed and reason_changed, false on noop (it already read that way). It was once absent
// from changed, and a client testing `cancelled && !cancellationReasonUpdated` warned "your
// reason was not saved" on exactly the call that saved it. Non-cancel calls carry no reason,
// so a false there would read as "your reason was dropped".
//
// AN OUTCOME THIS FUNCTION DOES NOT KNOW IS AN ERROR (a 500), not changed: false. A fourth
// string means the SQL moved and this layer did not, and the route writes an audit row for
// anything that reaches its fall-through, so "nothing happened" here would leave the audit
// log and the response describing different events.
func StageWriteBody(tripID, requestedStatus string, result StageWriteResult) (js.Ordered, error) {
	if !knownOutcome(result.Outcome) {
		return nil, errors.New("unhandled agent_set_trip_status outcome: " + result.Outcome)
	}

	var reasonFlag js.Ordered
	if requestedStatus == "cancelled" {
		// noop is the only shape that wrote nothing; the other two both landed the reason.
		reasonFlag = js.O("cancellationReasonUpdated", result.Outcome != "noop")
	}

	if result.Outcome == "changed" {
		return js.O(
			"tripId", tripID,
			"status", result.ToStatus,
			"previousStatus", result.FromStatus,
			"version", result.Version,
			"changed", true,
		).Spread(reasonFlag), nil
	}
	return js.O(
		"tripId", tripID,
		"status", result.ToStatus,
		"version", result.Version,
		"changed", false,
	).Spread(reasonFlag), nil
}
