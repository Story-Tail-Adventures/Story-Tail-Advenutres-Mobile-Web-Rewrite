// Package agentsettings ports supabase/functions/agent-settings: §3.12 Agent Settings,
// Profile (3.12.1), Availability (3.12.2), Notifications (3.12.3) and Signature (3.12.4).
// Rulings: docs/Screen-Inventory.md §3.12 (2026-10-17). MOBILE-CALLED: every sentence and
// status is the phone's contract.
//
// ONE DOOR, EIGHT OPS: update_profile, set_avatar, remove_avatar, update_availability,
// save_time_off, end_time_off, update_notifications, update_signature.
//
// Every write is a service_role SQL function that writes its own audit_event row in the same
// transaction (the p_audit_id minted here), with {from, to} for each changed field. An
// unchanged save writes nothing and answers `unchanged`.
//
// THE PHOTO. The bucket is public (the photo goes into email, which has no session) and only
// the service role writes it. The key is chosen here, `<agent id>/<new v7>.<ext>`, never by the
// caller; the type comes from the file's own first bytes; and the profile stores the PATH
// (`/storage/v1/object/public/...`), which each surface puts on its own public origin. Order:
// upload the new object, point the profile at it (audited), THEN delete the old object. A
// failure before the profile moves removes the new object again; a failed delete of the old
// one leaves an orphan, never a profile pointing at nothing.
package agentsettings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	rules "github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agentsettings"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// backend is what the function needs from the service client (*service.Client).
type backend interface {
	RPC(ctx context.Context, fn string, args any, out any) error
	RPCRow(ctx context.Context, fn string, args any, out any) (bool, error)
	Upload(ctx context.Context, bucket, key string, data []byte, opt service.UploadOptions) error
	Remove(ctx context.Context, bucket string, keys []string) error
}

// newID mints the audit ids and the avatar keys; tests replace it.
var newID = uuid.New

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
	return handle(r.Context(), d.DB, c, agentID, payload, d.Now())
}

const (
	noProfile = "We couldn't find your advisor profile."
	noTimeOff = "That time away isn't on your calendar."
)

var ops = map[string]bool{"update_profile": true, "set_avatar": true, "remove_avatar": true,
	"update_availability": true, "save_time_off": true, "end_time_off": true,
	"update_notifications": true, "update_signature": true}

func handle(ctx context.Context, db backend, c *caller.Context, agentID string, payload js.Value, now time.Time) (*edge.Reply, error) {
	op, _ := payload.Get("op").Str()
	if !ops[op] {
		return nil, problem.BadRequest("That request wasn't one we recognize. Reload the page and try again.")
	}
	// The SQL function writes the audit row with these, in its own transaction.
	audit := js.O("p_audit_id", newID(), "p_actor_user_id", c.PlatformUserID, "p_ip", c.IP, "p_user_agent", c.UserAgent)
	h := handler{ctx: ctx, db: db, agentID: agentID, audit: audit}

	switch op {
	case "update_profile":
		name, err := rules.ReadDisplayName(payload.Get("displayName"))
		if err != nil {
			return nil, err
		}
		pronouns, err := rules.ReadOptionalText(payload.Get("pronouns"), rules.MaxPronouns, "Pronouns")
		if err != nil {
			return nil, err
		}
		phone, err := rules.ReadPhone(payload.Get("phone"))
		if err != nil {
			return nil, err
		}
		bio, err := rules.ReadOptionalText(payload.Get("bio"), rules.MaxBio, "Bio")
		if err != nil {
			return nil, err
		}
		links, err := rules.ReadSocialLinks(payload.Get("socialLinks"))
		if err != nil {
			return nil, err
		}
		return h.scalarWrite("agent_settings_update_profile", "profile update failed", js.O("p_agent_id", agentID,
			"p_display_name", name, "p_pronouns", pronouns, "p_phone", phone, "p_bio", bio, "p_social_links", links))

	case "set_avatar":
		return h.setAvatar(payload)

	case "remove_avatar":
		return h.removeAvatar()

	case "update_availability":
		zone, err := rules.ReadTimeZone(payload.Get("timeZone"))
		if err != nil {
			return nil, err
		}
		week, err := rules.ReadWeeklySchedule(payload.Get("weeklySchedule"))
		if err != nil {
			return nil, err
		}
		hours, err := rules.ReadResponseTime(payload.Get("responseTimeHours"))
		if err != nil {
			return nil, err
		}
		return h.scalarWrite("agent_settings_update_availability", "availability update failed", js.O("p_agent_id", agentID,
			"p_time_zone", zone, "p_weekly_schedule", week, "p_response_time_hours", hours))

	case "save_time_off":
		return h.saveTimeOff(payload, now)

	case "update_notifications":
		args := js.O("p_agent_id", agentID)
		for _, s := range []struct{ key, arg, label string }{
			{"clientMessagesPush", "p_client_messages_push", "Client message push"},
			{"clientMessagesEmail", "p_client_messages_email", "Client message email"},
			{"quoteRequestsPush", "p_quote_requests_push", "New inquiries and messages push"},
			{"quoteRequestsEmail", "p_quote_requests_email", "New inquiries and messages email"},
		} {
			on, err := rules.ReadSwitch(payload.Get(s.key), s.label)
			if err != nil {
				return nil, err
			}
			args = append(args, js.Field{Key: s.arg, Value: on})
		}
		return h.scalarWrite("agent_settings_update_notifications", "notifications update failed", args)

	case "update_signature":
		sig, err := rules.ReadSignature(payload.Get("signature"))
		if err != nil {
			return nil, err
		}
		return h.scalarWrite("agent_settings_update_signature", "signature update failed",
			js.O("p_agent_id", agentID, "p_signature", sig))

	default: // end_time_off
		id, err := timeOffID(payload)
		if err != nil {
			return nil, err
		}
		outcome, ok, err := h.scalar("agent_settings_end_time_off", js.O("p_id", id, "p_agent_id", agentID))
		if err != nil {
			return nil, fmt.Errorf("time off end failed: %w", err)
		}
		switch {
		case ok && (outcome == "deleted" || outcome == "ended"):
			return edge.OK(js.O("outcome", outcome))
		case ok && outcome == "past":
			return nil, problem.Conflict("That time away is already over.")
		}
		return nil, problem.NotFound(noTimeOff)
	}
}

type handler struct {
	ctx     context.Context
	db      backend
	agentID string
	audit   js.Ordered
}

// scalar calls a function that returns text; ok is false when the reply is not a string
// (`typeof data === "string" ? data : null`).
func (h handler) scalar(fn string, args js.Ordered) (string, bool, error) {
	var raw json.RawMessage
	if err := h.db.RPC(h.ctx, fn, args.Spread(h.audit), &raw); err != nil {
		return "", false, err
	}
	var s string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &s) != nil {
		return "", false, nil
	}
	return s, true, nil
}

// scalarWrite is the four writes that answer {outcome} or "no profile".
func (h handler) scalarWrite(fn, failure string, args js.Ordered) (*edge.Reply, error) {
	outcome, ok, err := h.scalar(fn, args)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", failure, err)
	}
	if !ok || outcome == "" || outcome == "not_found" {
		return nil, problem.NotFound(noProfile)
	}
	return edge.OK(js.O("outcome", outcome))
}

type avatarRow struct {
	Outcome     string  `json:"outcome"`
	PreviousURL *string `json:"previous_url"`
}

func (h handler) oldKey(row avatarRow) (string, bool) {
	prev := ""
	if row.PreviousURL != nil {
		prev = *row.PreviousURL
	}
	return rules.AvatarKeyFromURL(prev, h.agentID)
}

func (h handler) setAvatar(payload js.Value) (*edge.Reply, error) {
	img, err := rules.ReadAvatar(payload.Get("image"))
	if err != nil {
		return nil, err
	}
	key := h.agentID + "/" + newID() + "." + img.Ext
	if err := h.db.Upload(h.ctx, rules.AvatarBucket, key, img.Bytes, service.UploadOptions{
		ContentType: img.ContentType,
		// A year: the key is new for every photo, so a cached copy can never be stale.
		CacheControl: "31536000",
	}); err != nil {
		return nil, fmt.Errorf("avatar upload failed: %w", err)
	}
	// A path, never the absolute URL (getPublicUrl's pathname): see the migration's note on
	// agent_settings_set_avatar.
	avatarPath := "/storage/v1/object/public/" + rules.AvatarBucket + "/" + key
	var row avatarRow
	found, err := h.db.RPCRow(h.ctx, "agent_settings_set_avatar",
		js.O("p_agent_id", h.agentID, "p_avatar_url", avatarPath).Spread(h.audit), &row)
	if err != nil || !found || row.Outcome == "not_found" {
		// storage-js reports a failed remove in its result rather than throwing, and the
		// Deno code did not read it.
		_ = h.db.Remove(h.ctx, rules.AvatarBucket, []string{key})
		if err != nil {
			return nil, fmt.Errorf("avatar update failed: %w", err)
		}
		return nil, problem.NotFound(noProfile)
	}
	if old, ok := h.oldKey(row); ok && old != key {
		_ = h.db.Remove(h.ctx, rules.AvatarBucket, []string{old})
	}
	return edge.OK(js.O("outcome", row.Outcome, "avatarPath", avatarPath))
}

func (h handler) removeAvatar() (*edge.Reply, error) {
	var row avatarRow
	found, err := h.db.RPCRow(h.ctx, "agent_settings_set_avatar",
		js.O("p_agent_id", h.agentID, "p_avatar_url", nil).Spread(h.audit), &row)
	if err != nil {
		return nil, fmt.Errorf("avatar removal failed: %w", err)
	}
	if !found || row.Outcome == "not_found" {
		return nil, problem.NotFound(noProfile)
	}
	if old, ok := h.oldKey(row); ok {
		_ = h.db.Remove(h.ctx, rules.AvatarBucket, []string{old})
	}
	return edge.OK(js.O("outcome", row.Outcome))
}

func timeOffID(payload js.Value) (string, error) {
	id, ok := payload.Get("timeOffId").Str()
	if !ok || !uuid.IsUUID(id) {
		return "", problem.BadRequest("That time away didn't come through. Reload the page and try again.")
	}
	return id, nil
}

func (h handler) saveTimeOff(payload js.Value, now time.Time) (*edge.Reply, error) {
	id, err := timeOffID(payload)
	if err != nil {
		return nil, err
	}
	isNew := payload.Get("isNew").IsTrue()
	if isNew && uuid.CheckRecent(id, now) != nil {
		return nil, problem.BadRequest("This page is a little out of date. Reload and try again.")
	}
	dates, err := rules.ReadTimeOffDates(payload.Get("startsOn"), payload.Get("endsOn"))
	if err != nil {
		return nil, err
	}
	reply, err := rules.ReadAutoReply(payload.Get("autoReplyEnabled"), payload.Get("autoReplyText"))
	if err != nil {
		return nil, err
	}
	label, err := rules.ReadOptionalText(payload.Get("label"), rules.MaxTimeOffLabel, "The label")
	if err != nil {
		return nil, err
	}
	outcome, ok, err := h.scalar("agent_settings_save_time_off", js.O("p_id", id, "p_agent_id", h.agentID,
		"p_is_new", isNew, "p_starts_on", dates.StartsOn, "p_ends_on", dates.EndsOn, "p_label", label,
		"p_auto_reply_enabled", reply.Enabled, "p_auto_reply_text", reply.Text))
	if err != nil {
		return nil, fmt.Errorf("time off save failed: %w", err)
	}
	if !ok {
		return nil, problem.NotFound(noTimeOff)
	}
	switch outcome {
	case "created", "updated", "unchanged":
		return edge.OK(js.O("outcome", outcome, "timeOffId", id))
	case "overlap":
		return nil, problem.Conflict("Those dates overlap time away you've already set. Pick different days.")
	case "starts_in_past":
		return nil, problem.BadRequest("Time away can start today or later.")
	case "started":
		return nil, problem.Conflict("This time away has already started. You can end it early instead.")
	case "bad_dates":
		return nil, problem.BadRequest("The last day away can't be before the first.")
	case "reply_needs_text":
		return nil, problem.BadRequest("Add the words for your automatic reply, or turn it off.")
	}
	return nil, problem.NotFound(noTimeOff)
}
