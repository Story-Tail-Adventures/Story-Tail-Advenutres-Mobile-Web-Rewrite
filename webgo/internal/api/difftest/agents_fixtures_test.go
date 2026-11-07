//go:build difftest && difftest_agent

package difftest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Fixtures shared by the agent-area tests (agent-client, agent-client-notes, agent-template,
// agent-message-template, agent-settings, agent-message). Every row is fresh and removed in
// t.Cleanup; seed rows are only ever read.

// Seed rows of the seed advisor's: the "not yours" targets, read-only.
const (
	agentsSeedClient = "0195a2c0-1a00-7000-8000-000000000100"
	agentsSeedNote   = "0195a2c0-1a00-7000-8000-000000000520"
	agentsSeedTrip   = "0195a2c0-1a00-7000-8000-000000000040"
)

func agentsMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// agentsOther pairs each world with the other one, for "another advisor's row" cases.
func agentsOther(deno, goW *World) func(w *World) *World {
	return func(w *World) *World {
		if w == deno {
			return goW
		}
		return deno
	}
}

// agentsBody fills {key} in a template from w.Vars.
func agentsBody(tmpl string) func(w *World) string {
	return func(w *World) string {
		s := tmpl
		for k, v := range w.Vars {
			s = strings.ReplaceAll(s, "{"+k+"}", v)
		}
		return s
	}
}

func agentsFixed(s string) func(*World) string { return func(*World) string { return s } }

// agentsNewClient makes a client of owner's advisor, labelled and kept in w.Vars under key,
// and removes it (with its notes and its address) at cleanup. cols override or add columns.
func agentsNewClient(t *testing.T, w, owner *World, key string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "agent_id", owner.Agent.AgentID, "first_name", "Fix", "last_name", "Ture",
		"email", key+"@example.com")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("client").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { agentsDropClient(id) })
	return id
}

// agentsNewAddress makes an address row (removed at cleanup) for a fixture client to point at.
func agentsNewAddress(t *testing.T, w *World, key string) string {
	t.Helper()
	id := uuid.New()
	agentsMust(t, S.DB.From("address").Insert(context.Background(), js.O("id", id, "line1", "9 Old Rd",
		"city", "Leeds", "country", "GB"), nil))
	w.ID(key, id)
	t.Cleanup(func() { _ = S.DB.From("address").Eq("id", id).Delete(context.Background(), nil) })
	return id
}

// agentsDropClient removes a client, its notes and its current address.
func agentsDropClient(id string) {
	ctx := context.Background()
	var row struct {
		Address *string `json:"mailing_address_id"`
	}
	_, _ = S.DB.From("client").Select("mailing_address_id").Eq("id", id).MaybeSingle(ctx, &row)
	agentsDropConversations("client_id", id)
	_ = S.DB.From("client_note").Eq("client_id", id).Delete(ctx, nil)
	_ = S.DB.From("client").Eq("id", id).Delete(ctx, nil)
	if row.Address != nil {
		_ = S.DB.From("address").Eq("id", *row.Address).Delete(ctx, nil)
	}
}

// agentsDropClientsByEmail removes the clients a create wrote (their ids are minted by the
// function, so the fixture only knows the email).
func agentsDropClientsByEmail(t *testing.T, w *World, email string) {
	t.Cleanup(func() {
		var rows []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("client").Select("id").Eq("agent_id", w.Agent.AgentID).Eq("email", email).Rows(context.Background(), &rows)
		for _, r := range rows {
			agentsDropClient(r.ID)
		}
	})
}

const agentsClientCols = "id,agent_id,first_name,last_name,preferred_name,email,phone,date_of_birth,important_dates,tags," +
	"status,notes,archived_at,version,address:mailing_address_id(line1,line2,city,region,postal_code,country)"

// agentsClientRow reads one client back with every column the function can write.
func agentsClientRow(t *testing.T, id string) string {
	return S.Rows(t, S.DB.From("client").Select(agentsClientCols).Eq("id", id))
}

// agentsClientsByEmail reads the advisor's clients with this email.
func agentsClientsByEmail(t *testing.T, w *World, email string) string {
	return S.Rows(t, S.DB.From("client").Select(agentsClientCols).Eq("agent_id", w.Agent.AgentID).Eq("email", email).Order("created_at", true))
}

// agentsActors are the platform_user ids whose audit rows a world's request can write.
func agentsActors(w *World) []string {
	return []string{w.Agent.PlatformUserID, w.Traveler.PlatformUserID}
}

// agentsMark records, just before the request, the audit rows already inside the harness's
// one-second slack window, so agentsAudit can leave them out. Without it a row the PREVIOUS
// case wrote less than a second earlier lands in this case's comparison on one side only.
func agentsMark(t *testing.T, w *World) {
	t.Helper()
	w.Vars["mark"] = Since(time.Now())
	var rows []struct {
		ID string `json:"id"`
	}
	agentsMust(t, S.DB.From("audit_event").Select("id").In("actor_user_id", agentsActors(w)).
		Gte("id", w.Vars["mark"]).Rows(context.Background(), &rows))
	seen := make([]string, len(rows))
	for i, r := range rows {
		seen[i] = r.ID
	}
	w.Vars["mark.seen"] = strings.Join(seen, ",")
}

// agentsAudit is exactly the audit rows world w's actors wrote since agentsMark, normalized
// and sorted: a request that writes several rows in one insert mints v7 ids in the same
// millisecond, so their id order is random on both sides.
func agentsAudit(t *testing.T, w *World) string {
	t.Helper()
	q := S.DB.From("audit_event").
		Select("actor_role,event_type,target_entity,target_id,metadata,user_agent").
		In("actor_user_id", agentsActors(w)).Gte("id", w.Vars["mark"])
	if seen := w.Vars["mark.seen"]; seen != "" {
		q = q.Not("id", "in", "("+seen+")")
	}
	var rows []json.RawMessage
	agentsMust(t, q.Rows(context.Background(), &rows))
	lines := make([]string, len(rows))
	for i, r := range rows {
		lines[i] = w.Normalize(string(r))
	}
	sort.Strings(lines)
	return "audit:[" + strings.Join(lines, ",") + "]"
}

// agentsExact makes every case compare exactly the audit rows its own request wrote (see
// agentsMark), in place of the harness's window, and appends them to the case's Snap.
func agentsExact(cases []Case) []Case {
	out := make([]Case, len(cases))
	for i, c := range cases {
		setup, snap := c.Setup, c.Snap
		c.SkipAudit = true
		c.Setup = func(t *testing.T, w *World) {
			if setup != nil {
				setup(t, w)
			}
			agentsMark(t, w)
		}
		c.Snap = func(t *testing.T, w *World) string {
			s := ""
			if snap != nil {
				s = snap(t, w)
			}
			s += agentsAudit(t, w)
			if os.Getenv("STA_DIFF_AGENTS_SHOW") != "" {
				t.Logf("%s rows: %s", w.Name, w.Normalize(s))
			}
			return s
		}
		out[i] = c
	}
	return out
}

// agentsNewNote makes a client_note on a fixture client, labelled and kept in w.Vars under
// key. It goes with its client at cleanup.
func agentsNewNote(t *testing.T, w *World, key, clientID, authorPU string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "client_id", clientID, "author_user_id", authorPU, "body", "Original note")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("client_note").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	return id
}

// agentsNotes reads a client's notes back, oldest first.
func agentsNotes(t *testing.T, clientID string) string {
	return S.Rows(t, S.DB.From("client_note").Select("id,client_id,author_user_id,body,archived_at").
		Eq("client_id", clientID).Order("created_at", true).Order("id", true))
}

// agentsSupplier is a seed supplier, read-only.
const agentsSupplier = "0195a2c0-1a00-7000-8000-000000000030"

// agentsNewTrip makes a trip of owner's advisor for owner's traveler, labelled and kept in
// w.Vars under key, and removes it with every child row at cleanup. cols override or add
// columns. With rich, it also gets two components, an itinerary, two days and activities.
func agentsNewTrip(t *testing.T, w, owner *World, key string, rich bool, cols js.Ordered) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	row := js.O("id", id, "client_id", owner.Traveler.ClientID, "agent_id", owner.Agent.AgentID,
		"title", "Difftest trip", "trip_type", "all_inclusive", "status", "proposal", "version", 2)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("trip").Insert(ctx, row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { agentsDropTrip(id) })
	if !rich {
		return id
	}
	agentsMust(t, S.DB.From("trip_component").Insert(ctx, []js.Ordered{
		js.O("id", uuid.New(), "trip_id", id, "kind", "hotel", "supplier_id", agentsSupplier, "display_name", "Sandals Negril",
			"start_date", "2027-03-01", "end_date", "2027-03-06", "start_time", "15:00", "location", "Negril",
			"confirmation_number", "SECRET-1", "cost_cents", 250000, "commission_pct", 12.5, "commission_cents", 31250,
			"payload", js.O("room", "suite"), "order_index", 0),
		// A batch insert sends every key for every row (missing ones as null, not default).
		js.O("id", uuid.New(), "trip_id", id, "kind", "transfer", "supplier_id", nil, "display_name", "Airport shuttle",
			"start_date", nil, "end_date", nil, "start_time", nil, "location", nil,
			"confirmation_number", nil, "cost_cents", 5000, "commission_pct", nil, "commission_cents", 0,
			"payload", js.O(), "order_index", 1),
	}, nil))
	itin := uuid.New()
	agentsMust(t, S.DB.From("itinerary").Insert(ctx, js.O("id", itin, "trip_id", id, "intro_note", "Welcome to Negril",
		"closing_note", "Safe travels"), nil))
	d1, d2 := uuid.New(), uuid.New()
	agentsMust(t, S.DB.From("itinerary_day").Insert(ctx, []js.Ordered{
		js.O("id", d1, "itinerary_id", itin, "day_number", 1, "date", "2027-03-01", "label", "Arrive", "summary", "Settle in"),
		js.O("id", d2, "itinerary_id", itin, "day_number", 2, "date", "2027-03-02", "label", "Beach", "summary", nil),
	}, nil))
	agentsMust(t, S.DB.From("itinerary_activity").Insert(ctx, []js.Ordered{
		js.O("id", uuid.New(), "itinerary_day_id", d1, "block", "afternoon", "start_time", "15:00", "title", "Check in",
			"body", "Lobby", "gyasis_tip", "Ask for the ocean side", "confirmation_number", "SECRET-2", "order_index", 0),
		js.O("id", uuid.New(), "itinerary_day_id", d1, "block", "evening", "start_time", nil, "title", "Dinner",
			"body", nil, "gyasis_tip", nil, "confirmation_number", nil, "order_index", 1),
	}, nil))
	return id
}

// agentsDropTrip removes a fixture trip and its children, leaves first.
func agentsDropTrip(id string) {
	ctx := context.Background()
	var its []struct {
		ID string `json:"id"`
	}
	_ = S.DB.From("itinerary").Select("id").Eq("trip_id", id).Rows(ctx, &its)
	for _, it := range its {
		var days []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("itinerary_day").Select("id").Eq("itinerary_id", it.ID).Rows(ctx, &days)
		for _, d := range days {
			_ = S.DB.From("itinerary_activity").Eq("itinerary_day_id", d.ID).Delete(ctx, nil)
		}
		_ = S.DB.From("itinerary_day").Eq("itinerary_id", it.ID).Delete(ctx, nil)
	}
	agentsDropConversations("trip_id", id)
	for _, table := range []string{"itinerary", "payment_milestone", "commission", "trip_component", "trip_status_history", "push_outbox", "conversation"} {
		_ = S.DB.From(table).Eq("trip_id", id).Delete(ctx, nil)
	}
	_ = S.DB.From("trip").Eq("id", id).Delete(ctx, nil)
}

// agentsTemplatePayload is a template payload in the shape agent_save_trip_as_template
// writes: offsets, not dates.
func agentsTemplatePayload() js.Ordered {
	return js.O("version", 1, "traveler_count", 2, "destinations", []string{"Jamaica", "Negril"},
		"intro_note", "From the pattern", "closing_note", "Pattern goodbye",
		"components", []js.Ordered{
			js.O("kind", "hotel", "display_name", "Pattern resort", "supplier_id", agentsSupplier, "start_day", 0, "end_day", 4,
				"start_time", "15:00:00", "end_time", nil, "location", "Negril", "cost_cents", 180000, "commission_pct", 10,
				"commission_cents", 18000, "currency", "USD", "payload", js.O("room", "garden"), "order_index", 0),
			js.O("kind", "excursion", "display_name", "Rick's Cafe", "supplier_id", nil, "start_day", nil, "end_day", nil,
				"start_time", nil, "end_time", nil, "location", nil, "cost_cents", 4000, "commission_pct", nil,
				"commission_cents", 0, "currency", "USD", "payload", js.O(), "order_index", 1),
		},
		"days", []js.Ordered{
			js.O("day_number", 1, "day_offset", 0, "label", "Arrive", "summary", "Unpack", "activities", []js.Ordered{
				js.O("block", "afternoon", "start_time", "15:00:00", "end_time", nil, "title", "Check in", "body", nil,
					"location", nil, "address", nil, "phone", nil, "gyasis_tip", "Ocean side", "order_index", 0),
			}),
			js.O("day_number", 2, "day_offset", 1, "label", "Cliffs", "summary", nil, "activities", []js.Ordered{
				js.O("block", "evening", "start_time", nil, "end_time", nil, "title", "Sunset", "body", "Jump if you dare",
					"location", "West End", "address", nil, "phone", nil, "gyasis_tip", nil, "order_index", 0),
				js.O("block", "morning", "start_time", "09:00:00", "end_time", "10:00:00", "title", "Breakfast", "body", nil,
					"location", nil, "address", nil, "phone", nil, "gyasis_tip", nil, "order_index", 1),
			}),
		})
}

// agentsNewTemplate makes a trip_template of owner's advisor, labelled and kept in w.Vars
// under key. Removed at cleanup, after any fixture trip pointing at it lets go.
func agentsNewTemplate(t *testing.T, w, owner *World, key string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "agent_id", owner.Agent.AgentID, "name", "Fixture template", "trip_type", "all_inclusive",
		"payload", agentsTemplatePayload())
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("trip_template").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { agentsDropTemplate(id) })
	return id
}

func agentsDropTemplate(id string) {
	ctx := context.Background()
	_ = S.DB.From("trip").Eq("template_id", id).Update(ctx, js.O("template_id", nil), nil)
	_ = S.DB.From("trip_template").Eq("id", id).Delete(ctx, nil)
}

// agentsDropTemplates removes every template of w's advisor at the end of the test (the
// ones `save` minted, whose ids only the reply knew).
func agentsDropTemplates(t *testing.T, w *World) {
	t.Cleanup(func() {
		var rows []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("trip_template").Select("id").Eq("agent_id", w.Agent.AgentID).Rows(context.Background(), &rows)
		for _, r := range rows {
			agentsDropTemplate(r.ID)
		}
	})
}

// agentsTemplates reads a template back by id or, for one `save` minted, by its name.
func agentsTemplate(t *testing.T, column, value string) string {
	return S.Rows(t, S.DB.From("trip_template").Select("id,agent_id,name,description,trip_type,payload,archived_at").
		Eq(column, value).Order("created_at", true))
}

// agentsTripTree reads a trip back with everything apply can write: the trip, its
// components, its itinerary, and each day (by day_number) with its activities.
func agentsTripTree(t *testing.T, id string) string {
	ctx := context.Background()
	out := S.Rows(t, S.DB.From("trip").Select("id,template_id,traveler_count,destinations,total_value_cents,"+
		"total_commission_cents,version,start_date").Eq("id", id))
	out += S.Rows(t, S.DB.From("trip_component").Select("kind,supplier_id,display_name,start_date,end_date,start_time,"+
		"end_time,location,confirmation_number,cost_cents,commission_pct,commission_cents,currency,payload,order_index,archived_at").
		Eq("trip_id", id).Order("order_index", true).Order("display_name", true))
	var its []struct {
		ID string `json:"id"`
	}
	agentsMust(t, S.DB.From("itinerary").Select("id").Eq("trip_id", id).Rows(ctx, &its))
	for _, it := range its {
		out += S.Rows(t, S.DB.From("itinerary").Select("intro_note,closing_note,version").Eq("id", it.ID))
		var days []struct {
			ID string `json:"id"`
		}
		agentsMust(t, S.DB.From("itinerary_day").Select("id").Eq("itinerary_id", it.ID).Order("day_number", true).Rows(ctx, &days))
		for _, d := range days {
			out += S.Rows(t, S.DB.From("itinerary_day").Select("day_number,date,label,summary,weather_forecast").Eq("id", d.ID))
			out += S.Rows(t, S.DB.From("itinerary_activity").Select("block,start_time,end_time,title,body,location,address,"+
				"phone,gyasis_tip,confirmation_number,component_id,order_index").Eq("itinerary_day_id", d.ID).
				Order("order_index", true).Order("title", true))
		}
	}
	return out
}

// agentsNewMessageTemplate makes a message_template of owner's advisor, labelled and kept in
// w.Vars under key (with the id in w.Vars[key] already, when a case chose it). Removed at
// cleanup.
func agentsNewMessageTemplate(t *testing.T, w, owner *World, key string, cols js.Ordered) string {
	t.Helper()
	id := w.Vars[key]
	if id == "" {
		id = uuid.New()
	}
	row := js.O("id", id, "agent_id", owner.Agent.AgentID, "category", "pre_trip", "name", "Fixture message",
		"body_markdown", "Hi {{client.firstName}}, see you soon.", "tags", []string{"Beach"})
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("message_template").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { agentsDropMessageTemplate(id) })
	return id
}

func agentsDropMessageTemplate(id string) {
	_ = S.DB.From("message_template").Eq("id", id).Delete(context.Background(), nil)
}

// agentsFreshID mints a v7 now for the request to name, labels it, and removes whatever row
// the request makes with it at cleanup.
func agentsFreshID(t *testing.T, w *World, key string, drop func(string)) string {
	id := uuid.New()
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { drop(id) })
	return id
}

// agentsMessageTemplates reads message templates back by id, in the order given.
func agentsMessageTemplates(t *testing.T, ids ...string) string {
	out := ""
	for _, id := range ids {
		out += S.Rows(t, S.DB.From("message_template").Select("id,agent_id,category,name,subject,body_markdown,tags,archived_at").Eq("id", id))
	}
	return out
}

// ---- agent settings ----

// agentsSettingsBase remembers the world's advisor's availability as the harness made it,
// so each settings case can start from it again.
func agentsSettingsBase(t *testing.T, w *World) {
	t.Helper()
	var rows []json.RawMessage
	agentsMust(t, S.DB.From("agent_availability").Select("weekly_schedule").Eq("agent_id", w.Agent.AgentID).Rows(context.Background(), &rows))
	if len(rows) != 1 {
		t.Fatalf("no availability row for the fixture advisor")
	}
	var r struct {
		Week json.RawMessage `json:"weekly_schedule"`
	}
	agentsMust(t, json.Unmarshal(rows[0], &r))
	w.Vars["settings.week"] = string(r.Week)
	w.Vars["tag"] = w.Tag
	t.Cleanup(func() {
		ctx := context.Background()
		_ = S.DB.From("agent_time_off").Eq("agent_id", w.Agent.AgentID).Delete(ctx, nil)
		_ = S.DB.From("notification_preference").Eq("user_id", w.Agent.PlatformUserID).Delete(ctx, nil)
	})
}

// agentsResetSettings puts the world's advisor back where agentsSettingsBase found it, and
// removes any photo a case left in their folder.
func agentsResetSettings(t *testing.T, w *World) {
	t.Helper()
	ctx := context.Background()
	delete(w.Vars, "avatar.old")
	var a struct {
		Avatar *string `json:"avatar_url"`
	}
	_, _ = S.DB.From("agent").Select("avatar_url").Eq("id", w.Agent.AgentID).MaybeSingle(ctx, &a)
	if a.Avatar != nil {
		agentsRemoveAvatar(*a.Avatar)
	}
	agentsMust(t, S.DB.From("agent").Eq("id", w.Agent.AgentID).Update(ctx, js.O("display_name", "Diff Agent "+w.Tag,
		"pronouns", nil, "phone", nil, "bio", nil, "social_links", js.O(), "avatar_url", nil, "email_signature", nil,
		"time_zone", "America/Chicago"), nil))
	agentsMust(t, S.DB.From("agent_availability").Eq("agent_id", w.Agent.AgentID).Update(ctx, js.O(
		"weekly_schedule", json.RawMessage(w.Vars["settings.week"]), "response_time_hours", 24), nil))
	agentsMust(t, S.DB.From("agent_time_off").Eq("agent_id", w.Agent.AgentID).Delete(ctx, nil))
	agentsMust(t, S.DB.From("notification_preference").Eq("user_id", w.Agent.PlatformUserID).Delete(ctx, nil))
}

const agentsAvatarPrefix = "/storage/v1/object/public/agent-avatars/"

// agentsRemoveAvatar deletes a stored avatar object by its path.
func agentsRemoveAvatar(path string) {
	if strings.HasPrefix(path, agentsAvatarPrefix) {
		_ = S.DB.Remove(context.Background(), "agent-avatars", []string{strings.TrimPrefix(path, agentsAvatarPrefix)})
	}
}

// agentsPNG is the start of a PNG: enough for the type sniff, and for Storage.
var agentsPNG = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRdifftest")

// agentsNewAvatar stores a photo in the advisor's folder and points the profile at it, as a
// previous set_avatar would have, keeping its path in w.Vars["avatar.old"].
func agentsNewAvatar(t *testing.T, w *World, ext, contentType string) {
	t.Helper()
	ctx := context.Background()
	file := uuid.New()
	w.ID("avatar.old.file", file)
	key := w.Agent.AgentID + "/" + file + "." + ext
	agentsMust(t, S.DB.Upload(ctx, "agent-avatars", key, agentsPNG, service.UploadOptions{ContentType: contentType}))
	path := agentsAvatarPrefix + key
	w.Vars["avatar.old"] = path
	t.Cleanup(func() { agentsRemoveAvatar(path) })
	agentsMust(t, S.DB.From("agent").Eq("id", w.Agent.AgentID).Update(ctx, js.O("avatar_url", path), nil))
}

// agentsFetch is what a browser gets for a public Storage path: the status, the type and the
// size, never the bytes.
func agentsFetch(path string) string {
	resp, err := http.Get(S.URL + path)
	if err != nil {
		return "fetch failed"
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Sprintf("fetch %d", resp.StatusCode)
	}
	return fmt.Sprintf("fetch %d %s %d", resp.StatusCode, resp.Header.Get("Content-Type"), len(b))
}

// agentsSettingsSnap reads back everything agent-settings can write for the world's advisor,
// and fetches their photo (and the one it replaced, if a case set one up).
func agentsSettingsSnap(t *testing.T, w *World) string {
	t.Helper()
	ctx := context.Background()
	out := S.Rows(t, S.DB.From("agent").Select("display_name,pronouns,phone,bio,social_links,avatar_url,email_signature,time_zone").
		Eq("id", w.Agent.AgentID))
	out += S.Rows(t, S.DB.From("agent_availability").Select("weekly_schedule,response_time_hours").Eq("agent_id", w.Agent.AgentID))
	out += S.Rows(t, S.DB.From("agent_time_off").Select("id,starts_on,ends_on,label,auto_reply_enabled,auto_reply_text").
		Eq("agent_id", w.Agent.AgentID).Order("starts_on", true))
	out += S.Rows(t, S.DB.From("notification_preference").Select("channels").Eq("user_id", w.Agent.PlatformUserID))
	var a struct {
		Avatar *string `json:"avatar_url"`
	}
	_, _ = S.DB.From("agent").Select("avatar_url").Eq("id", w.Agent.AgentID).MaybeSingle(ctx, &a)
	if a.Avatar != nil {
		out += " new:" + agentsFetch(*a.Avatar)
	}
	if old := w.Vars["avatar.old"]; old != "" {
		out += " old:" + agentsFetch(old)
	}
	return out
}

// agentsLocalDay is a day relative to today in the advisor's zone (America/Chicago), the
// calendar agent_local_today() reads time away against.
func agentsLocalDay(days int) string {
	loc, err := time.LoadLocation("America/Chicago")
	if err != nil {
		panic(err)
	}
	return time.Now().In(loc).AddDate(0, 0, days).Format("2006-01-02")
}

// agentsNewTimeOff makes a block of time away for owner's advisor, labelled and kept in
// w.Vars under key. Removed with the world's settings at the end.
func agentsNewTimeOff(t *testing.T, w, owner *World, key string, from, to int, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "agent_id", owner.Agent.AgentID, "starts_on", agentsLocalDay(from), "ends_on", agentsLocalDay(to),
		"label", "Fixture trip")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("agent_time_off").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { _ = S.DB.From("agent_time_off").Eq("id", id).Delete(context.Background(), nil) })
	return id
}

// ---- messaging ----

// agentsDropConversations removes the threads on a client or a trip, their messages first
// (the outboxes go with them, ON DELETE CASCADE).
func agentsDropConversations(column, id string) {
	ctx := context.Background()
	var convs []struct {
		ID string `json:"id"`
	}
	_ = S.DB.From("conversation").Select("id").Eq(column, id).Rows(ctx, &convs)
	for _, c := range convs {
		_ = S.DB.From("message").Eq("conversation_id", c.ID).Delete(ctx, nil)
		_ = S.DB.From("conversation").Eq("id", c.ID).Delete(ctx, nil)
	}
}

// agentsNewConversation makes a thread of owner's advisor on a client (and trip, or ""),
// labelled and kept in w.Vars under key. It goes with its client or trip at cleanup.
func agentsNewConversation(t *testing.T, w, owner *World, key, clientID, tripID string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	var trip any
	if tripID != "" {
		trip = tripID
	}
	row := js.O("id", id, "client_id", clientID, "agent_id", owner.Agent.AgentID, "trip_id", trip,
		"subject", "Fixture thread", "last_message_at", "2026-11-01T10:00:00Z", "last_message_preview", "Earlier",
		"client_unread_count", 0, "agent_unread_count", 0)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	agentsMust(t, S.DB.From("conversation").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	return id
}

// agentsNewMessage puts a message in a fixture thread, labelled and kept in w.Vars under key.
func agentsNewMessage(t *testing.T, w *World, key, convID, senderPU, role, body, at string) string {
	t.Helper()
	id := uuid.New()
	agentsMust(t, S.DB.From("message").Insert(context.Background(), js.O("id", id, "conversation_id", convID,
		"sender_user_id", senderPU, "sender_role", role, "body", body, "created_at", at), nil))
	w.ID(key, id)
	w.Vars[key] = id
	return id
}

// agentsThreads reads back the threads on a client, oldest first, with their messages and
// outbox rows.
func agentsThreads(t *testing.T, clientID string) string {
	ctx := context.Background()
	var convs []struct {
		ID string `json:"id"`
	}
	agentsMust(t, S.DB.From("conversation").Select("id").Eq("client_id", clientID).Order("created_at", true).Order("id", true).Rows(ctx, &convs))
	out := ""
	for _, c := range convs {
		out += S.Rows(t, S.DB.From("conversation").Select("id,client_id,agent_id,trip_id,subject,last_message_at,"+
			"last_message_preview,client_unread_count,agent_unread_count,agent_archived_at,archived_at,updated_at").Eq("id", c.ID))
		out += S.Rows(t, S.DB.From("message").Select("id,sender_user_id,sender_role,body,is_internal_note,created_at,archived_at").
			Eq("conversation_id", c.ID).Order("created_at", true))
		out += S.Rows(t, S.DB.From("email_outbox").Select("client_user_id,latest_message_id,state").Eq("conversation_id", c.ID))
		out += S.Rows(t, S.DB.From("push_outbox").Select("agent_id,latest_message_id,message_count,state").Eq("conversation_id", c.ID))
	}
	return out
}
