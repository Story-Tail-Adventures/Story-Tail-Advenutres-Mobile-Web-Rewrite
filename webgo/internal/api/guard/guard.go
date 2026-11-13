// Package guard holds the database-backed checks the functions share: the halves of
// _shared/agent.ts, _shared/trip.ts and _shared/onboarding.ts that read a row. Their pure
// halves live in internal/domain/agent, trip and onboarding.
//
// Everything here runs on the service role, so RLS checks nothing: every ownership test is
// explicit and mirrors the predicate the read policies use. A row that is not the caller's
// answers exactly like a row that does not exist (404), so nobody can enumerate other
// people's ids.
package guard

import (
	"context"
	"fmt"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// RequireAgentID is requireAgentId: agent role, aal2, and an advisor record that is not
// archived (public.agent has no self-read policy for the agent role, so the lookup is the
// service role's).
func RequireAgentID(ctx context.Context, db *service.Client, c *caller.Context) (string, error) {
	return agent.RequireAgentID(c, func(agentID string) (string, bool, error) {
		var row struct {
			Status string `json:"status"`
		}
		found, err := db.From("agent").Select("status").Eq("id", agentID).MaybeSingle(ctx, &row)
		return row.Status, found, err
	})
}

// OwnedTrip is what requireOwnedTrip returns.
type OwnedTrip struct {
	ID      string
	AgentID string
	Title   string
}

// RequireOwnedTrip is requireOwnedTrip: the trip, if it is this client's and not archived;
// 404 "No such trip." otherwise, one answer for both. A malformed id is a 400 before it can
// reach Postgres and come back as an opaque 500.
func RequireOwnedTrip(ctx context.Context, db *service.Client, clientID, tripID string) (OwnedTrip, error) {
	if !uuid.IsUUID(tripID) {
		return OwnedTrip{}, problem.BadRequest("That is not a trip id.")
	}
	var row struct {
		ID         string  `json:"id"`
		ClientID   string  `json:"client_id"`
		AgentID    string  `json:"agent_id"`
		Title      string  `json:"title"`
		ArchivedAt *string `json:"archived_at"`
	}
	found, err := db.From("trip").Select("id, client_id, agent_id, title, archived_at").Eq("id", tripID).MaybeSingle(ctx, &row)
	if err != nil {
		return OwnedTrip{}, fmt.Errorf("trip lookup failed: %w", err)
	}
	if !found || row.ClientID != clientID || row.ArchivedAt != nil {
		return OwnedTrip{}, problem.NotFound("No such trip.")
	}
	return OwnedTrip{ID: row.ID, AgentID: row.AgentID, Title: row.Title}, nil
}

// OwnedConversation is what requireOwnedConversation returns.
type OwnedConversation struct {
	ID          string
	AgentID     string
	TripID      *string
	AgentUnread int64
}

// RequireOwnedConversation is requireOwnedConversation: §2.6 addresses a thread by
// conversation, since a general thread has no trip. Archived is not found: a client cannot
// read an archived thread, so they must not write to one.
func RequireOwnedConversation(ctx context.Context, db *service.Client, clientID, conversationID string) (OwnedConversation, error) {
	if !uuid.IsUUID(conversationID) {
		return OwnedConversation{}, problem.BadRequest("That is not a conversation id.")
	}
	var row struct {
		ID               string  `json:"id"`
		ClientID         string  `json:"client_id"`
		AgentID          string  `json:"agent_id"`
		TripID           *string `json:"trip_id"`
		AgentUnreadCount *int64  `json:"agent_unread_count"`
		ArchivedAt       *string `json:"archived_at"`
	}
	found, err := db.From("conversation").Select("id, client_id, agent_id, trip_id, agent_unread_count, archived_at").
		Eq("id", conversationID).MaybeSingle(ctx, &row)
	if err != nil {
		return OwnedConversation{}, fmt.Errorf("conversation lookup failed: %w", err)
	}
	if !found || row.ClientID != clientID || row.ArchivedAt != nil {
		return OwnedConversation{}, problem.NotFound("No such conversation.")
	}
	var unread int64
	if row.AgentUnreadCount != nil {
		unread = *row.AgentUnreadCount
	}
	return OwnedConversation{ID: row.ID, AgentID: row.AgentID, TripID: row.TripID, AgentUnread: unread}, nil
}

// RequireClientAgentID is requireClientAgentId: the advisor this client belongs to, needed
// only when creating a thread with no trip (conversation.agent_id is NOT NULL).
func RequireClientAgentID(ctx context.Context, db *service.Client, clientID string) (string, error) {
	var row struct {
		AgentID *string `json:"agent_id"`
	}
	found, err := db.From("client").Select("agent_id").Eq("id", clientID).MaybeSingle(ctx, &row)
	if err != nil {
		return "", fmt.Errorf("client lookup failed: %w", err)
	}
	if !found || row.AgentID == nil || *row.AgentID == "" {
		return "", problem.NotFound("No such client.")
	}
	return *row.AgentID, nil
}

// AdvanceOnboarding is advanceOnboarding: move the wizard's cursor to step, or (complete)
// clear it and stamp onboarding_completed_at, leaving an already-finished wizard's timestamp
// alone. platform_user has SELECT-only RLS (it carries role), so this is the service role's.
func AdvanceOnboarding(ctx context.Context, db *service.Client, platformUserID string, step *string, complete bool, now string) error {
	q := db.From("platform_user")
	var patch js.Ordered
	if complete {
		patch = js.O("onboarding_step", nil, "onboarding_completed_at", now)
	} else {
		patch = js.O("onboarding_step", step)
	}
	q = q.Eq("id", platformUserID)
	if complete {
		q = q.Is("onboarding_completed_at", nil)
	}
	if err := q.Update(ctx, patch, nil); err != nil {
		return fmt.Errorf("could not advance onboarding: %w", err)
	}
	return nil
}
