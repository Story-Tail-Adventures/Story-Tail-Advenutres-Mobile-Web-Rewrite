// Package agenttemplate ports supabase/functions/agent-template: §3.4.13 Trip Template
// Library's writes (save a trip as a template, rename it, retire it, apply it to a trip).
//
// ITS OWN DOOR, for the reason agent-itinerary has one: agent-trip already carries seven
// ops across three entity families, and `apply` writes components, itinerary days and
// activities in one statement.
//
// WHAT IT AUDITS is what happened, not that the route ran: `apply` on a trip that already
// carries a template_id answers `already_applied` and writes no audit row, and an update
// that changed nothing (`noop`) writes none either. A log full of clicks is not a history.
package agenttemplate

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	maxName        = 120
	maxDescription = 500
)

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
	audit.Inserter
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	agentID, err := guard.RequireAgentID(r.Context(), d.DB, c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	return handle(r.Context(), d.DB, c, agentID, payload)
}

func handle(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	switch op {
	case "save":
		return save(ctx, db, c, agentID, payload)
	case "update":
		return update(ctx, db, c, agentID, payload)
	case "archive":
		return archive(ctx, db, c, agentID, payload)
	case "apply":
		return apply(ctx, db, c, agentID, payload)
	}
	return nil, problem.BadRequest("op must be one of save, update, archive, apply.")
}

func requireID(v js.Value, field string) (string, error) {
	s, ok := v.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a " + field + ".")
	}
	return s, nil
}

// requireName: mandatory on save and update. The RPC raises on a blank one too; this turns
// that into a sentence. The length is checked here and not there: trip_template.name is
// unbounded text, and a card grid is not the place to discover an essay.
func requireName(v js.Value) (string, error) {
	s, ok := v.Str()
	if !ok || js.Trim(s) == "" {
		return "", problem.BadRequest("A template needs a name.")
	}
	name := js.Trim(s)
	if js.Len(name) > maxName {
		return "", problem.BadRequest("A template name is at most " + strconv.Itoa(maxName) + " characters.")
	}
	return name, nil
}

// optionalDescription is the trimmed text, or js.Undef (the key is left out of the RPC call
// and p_description takes its NULL default) for absent, null or blank.
func optionalDescription(v js.Value) (any, error) {
	if v.IsNullish() {
		return js.Undef, nil
	}
	s, ok := v.Str()
	if !ok {
		return nil, problem.BadRequest("A description must be text.")
	}
	text := js.Trim(s)
	if text == "" {
		return js.Undef, nil
	}
	if js.Len(text) > maxDescription {
		return nil, problem.BadRequest("A description is at most " + strconv.Itoa(maxDescription) + " characters.")
	}
	return text, nil
}

// nameAndDescription reads both in the order the object literal evaluated them.
func nameAndDescription(payload js.Value) (string, any, error) {
	name, err := requireName(payload.Get("name"))
	if err != nil {
		return "", nil, err
	}
	desc, err := optionalDescription(payload.Get("description"))
	if err != nil {
		return "", nil, err
	}
	return name, desc, nil
}

type saveRow struct {
	TemplateID      *string `json:"template_id"`
	ComponentsSaved *int64  `json:"components_saved"`
	DaysSaved       *int64  `json:"days_saved"`
}

// save snapshots a trip as a template.
func save(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	tripID, err := requireID(payload.Get("tripId"), "trip id")
	if err != nil {
		return nil, err
	}
	name, desc, err := nameAndDescription(payload)
	if err != nil {
		return nil, err
	}
	var row saveRow
	found, err := db.RPCRow(ctx, "agent_save_trip_as_template", js.O(
		"p_trip_id", tripID, "p_agent_id", agentID, "p_name", name, "p_description", desc), &row)
	if err != nil {
		return nil, fmt.Errorf("template save failed: %w", err)
	}
	// Zero rows is "no such trip" and "not yours" alike, deliberately the same answer.
	if !found {
		return nil, problem.NotFound("That trip is not on your board.")
	}
	target := ""
	if row.TemplateID != nil {
		target = *row.TemplateID
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: "trip_template.created", TargetEntity: "trip_template", TargetID: target,
		// The SHAPE of what was captured, not the payload: it carries every cost on the
		// source trip, and an audit row is not where a price list belongs.
		Metadata: js.O("from_trip_id", tripID, "components_saved", row.ComponentsSaved, "days_saved", row.DaysSaved),
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("templateId", row.TemplateID, "componentsSaved", row.ComponentsSaved, "daysSaved", row.DaysSaved))
}

type outcomeRow struct {
	Outcome string `json:"outcome"`
}

const notInLibrary = "That template is not in your library."

// update renames or re-describes a template.
func update(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	templateID, err := requireID(payload.Get("templateId"), "template id")
	if err != nil {
		return nil, err
	}
	name, desc, err := nameAndDescription(payload)
	if err != nil {
		return nil, err
	}
	var row outcomeRow
	found, err := db.RPCRow(ctx, "agent_update_template", js.O(
		"p_template_id", templateID, "p_agent_id", agentID, "p_name", name, "p_description", desc), &row)
	if err != nil {
		return nil, fmt.Errorf("template update failed: %w", err)
	}
	if !found || row.Outcome == "not_found" {
		return nil, problem.NotFound(notInLibrary)
	}
	// `noop` writes nothing: an audit row saying a template changed when it did not is the
	// log lying quietly.
	if row.Outcome == "changed" {
		if err := audit.Write(ctx, db, c, audit.Spec{
			EventType: "trip_template.updated", TargetEntity: "trip_template", TargetID: templateID,
			Metadata: js.O("outcome", row.Outcome),
		}); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", row.Outcome))
}

// archive retires a template (a soft delete: trips seeded from it keep pointing at it).
func archive(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	templateID, err := requireID(payload.Get("templateId"), "template id")
	if err != nil {
		return nil, err
	}
	var row outcomeRow
	found, err := db.RPCRow(ctx, "agent_archive_template", js.O("p_template_id", templateID, "p_agent_id", agentID), &row)
	if err != nil {
		return nil, fmt.Errorf("template archive failed: %w", err)
	}
	if !found || row.Outcome == "not_found" {
		return nil, problem.NotFound(notInLibrary)
	}
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType: "trip_template.archived", TargetEntity: "trip_template", TargetID: templateID,
		Metadata: js.O(),
	}); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", row.Outcome))
}

type applyRow struct {
	Outcome         string `json:"outcome"`
	ComponentsAdded *int64 `json:"components_added"`
	DaysAdded       *int64 `json:"days_added"`
	ActivitiesAdded *int64 `json:"activities_added"`
}

// apply seeds a trip from a template.
func apply(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value) (*edge.Reply, error) {
	templateID, err := requireID(payload.Get("templateId"), "template id")
	if err != nil {
		return nil, err
	}
	tripID, err := requireID(payload.Get("tripId"), "trip id")
	if err != nil {
		return nil, err
	}
	var row applyRow
	found, err := db.RPCRow(ctx, "agent_apply_template", js.O(
		"p_template_id", templateID, "p_trip_id", tripID, "p_agent_id", agentID), &row)
	if err != nil {
		return nil, fmt.Errorf("template apply failed: %w", err)
	}
	if !found || row.Outcome == "not_found" {
		return nil, problem.NotFound("That template or trip is not yours.")
	}
	// `already_applied` IS A 200 WITH AN OUTCOME, not a 409: nothing is wrong, the trip
	// already came from a pattern, and the screen says so where the button is.
	if row.Outcome == "applied" {
		if err := audit.Write(ctx, db, c, audit.Spec{
			EventType: "trip.seeded_from_template", TargetEntity: "trip", TargetID: tripID,
			// WHAT LANDED: a pattern that produced no days because the trip has no dates
			// is a real outcome, and this is where it shows up.
			Metadata: js.O("template_id", templateID, "components_added", row.ComponentsAdded,
				"days_added", row.DaysAdded, "activities_added", row.ActivitiesAdded),
		}); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("outcome", row.Outcome, "componentsAdded", row.ComponentsAdded,
		"daysAdded", row.DaysAdded, "activitiesAdded", row.ActivitiesAdded))
}
