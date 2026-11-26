//go:build difftest && difftest_onboarding

package difftest

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingcompanions"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingconnect"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingpreferences"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingprofile"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/onboardingstep"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["onboarding-step"] = api.Port{Gate: api.GateUser, Fn: onboardingstep.Func}
	Extra["onboarding-profile"] = api.Port{Gate: api.GateUser, Fn: onboardingprofile.Func}
	Extra["onboarding-preferences"] = api.Port{Gate: api.GateUser, Fn: onboardingpreferences.Func}
	Extra["onboarding-companions"] = api.Port{Gate: api.GateUser, Fn: onboardingcompanions.Func}
	Extra["onboarding-connect"] = api.Port{Gate: api.GateUser, Fn: onboardingconnect.Func}
}

// ---- helpers (onb-prefixed: other areas' fixtures share the package) ----

func onbMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func onbFixed(s string) func(*World) string { return func(*World) string { return s } }

func onbAgent(w *World) string { return w.Agent.Token }

// onbCases sends every case to fn as the world's traveler (unless it names a token), and
// compares the audit rows ITS OWN request wrote: each request carries a unique User-Agent,
// which every audit row records, and those rows are read back by it, normalized and sorted.
// The harness's own read starts a second before the request and would pick up the previous
// case's rows on one side only.
func onbCases(fn string, cases []Case) []Case {
	out := make([]Case, len(cases))
	for i, cs := range cases {
		cs.Fn = fn
		if cs.Token == nil {
			cs.Token = func(w *World) string { return w.Traveler.Token }
		}
		hdr, snap := cs.Header, cs.Snap
		cs.Header = func(w *World) http.Header {
			h := http.Header{}
			if hdr != nil {
				for k, v := range hdr(w) {
					h[k] = v
				}
			}
			ua := "difftest-ua-" + Unique()
			w.Vars["ua"] = w.ID("ua", ua)
			h.Set("User-Agent", ua)
			return h
		}
		cs.Snap = func(t *testing.T, w *World) string {
			s := ""
			if snap != nil {
				s = snap(t, w)
			}
			return s + onbAudit(t, w)
		}
		cs.SkipAudit = true
		out[i] = cs
	}
	return out
}

func onbAudit(t *testing.T, w *World) string {
	t.Helper()
	raw := S.Rows(t, S.DB.From("audit_event").
		Select("actor_role,event_type,target_entity,target_id,metadata,user_agent").
		In("actor_user_id", []string{w.Agent.PlatformUserID, w.Traveler.PlatformUserID}).
		Eq("user_agent", w.Vars["ua"]))
	var rows []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		t.Fatalf("audit rows: %v", err)
	}
	norm := make([]string, len(rows))
	for i, r := range rows {
		norm[i] = w.Normalize(string(r))
	}
	sort.Strings(norm)
	return "\naudit:[" + strings.Join(norm, ",\n") + "]"
}

// onbPU is the traveler's platform_user: the wizard cursor and the client it points at.
func onbPU(t *testing.T, w *World) string {
	return "\npu:" + S.Rows(t, S.DB.From("platform_user").
		Select("client_id,display_name,onboarding_step,onboarding_completed_at").Eq("id", w.Traveler.PlatformUserID))
}

// onbFreshTraveler replaces the world's traveler with a new one (a fresh throwaway client and
// no onboarding progress), for cases that move the account.
func onbFreshTraveler(t *testing.T, w *World) {
	t.Helper()
	tag := Unique() // in the traveler's name and email, so labelled too
	w.Traveler = S.NewTraveler(t, w.ID("traveler.tag", tag), w.Agent)
	w.label(w.Traveler, "traveler")
}

// onbNewClient makes a client of w's advisor (no email, so no confirmation trigger adopts
// it), labelled and kept in w.Vars under key.
func onbNewClient(t *testing.T, w *World, key string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "agent_id", w.Agent.AgentID, "first_name", "Maya", "last_name", "Carter")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	onbMust(t, S.DB.From("client").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.Vars[key] = id
	t.Cleanup(func() { onbDropClient(id) })
	return id
}

// onbDropClient removes a fixture client and its children, best effort: after a redemption
// the traveler's platform_user still points at it until the harness deletes the user.
func onbDropClient(id string) {
	ctx := context.Background()
	for _, table := range []string{"client_invite", "travel_document", "companion", "travel_preference"} {
		_ = S.DB.From(table).Eq("client_id", id).Delete(ctx, nil)
	}
	_ = S.DB.From("client").Eq("id", id).Delete(ctx, nil)
}

// onbNewInvite issues an invite for clientID the way an advisor would: only the hash of a
// fresh code is stored. The code goes in w.Vars["code"].
func onbNewInvite(t *testing.T, w *World, clientID string, cols js.Ordered) string {
	t.Helper()
	ctx := context.Background()
	code := "DT-" + Unique()
	var hash string
	onbMust(t, S.DB.RPC(ctx, "client_invite_code_hash", js.O("p_code", code), &hash))
	id := uuid.New()
	row := js.O("id", id, "client_id", clientID, "code_hash", hash, "issued_by_user_id", w.Agent.PlatformUserID,
		"expires_at", time.Now().Add(30*24*time.Hour).UTC().Format(time.RFC3339))
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	onbMust(t, S.DB.From("client_invite").Insert(ctx, row, nil))
	w.ID("invite", id)
	w.Vars["invite"] = id
	w.Vars["code"] = code
	t.Cleanup(func() { _ = S.DB.From("client_invite").Eq("id", id).Delete(context.Background(), nil) })
	return code
}

// onbAttempts writes n earlier redeem attempts for the traveler, as the function would have.
func onbAttempts(t *testing.T, w *World, n int, outcome string, at time.Time) {
	t.Helper()
	rows := make([]js.Ordered, n)
	for i := range rows {
		rows[i] = js.O("id", uuid.New(), "actor_user_id", w.Traveler.PlatformUserID, "actor_role", "client",
			"event_type", "client_invite.redeem_attempted", "target_entity", "client_invite",
			"target_id", w.Traveler.PlatformUserID, "metadata", js.O("outcome", outcome),
			"created_at", at.UTC().Format(time.RFC3339Nano))
	}
	onbMust(t, S.DB.From("audit_event").Insert(context.Background(), rows, nil))
}

// ---- onboarding-step ----

func TestOnboardingStep(t *testing.T) {
	deno, goW := NewWorlds(t)
	snap := func(t *testing.T, w *World) string { return onbPU(t, w) }
	completedAt := func(t *testing.T, w *World) string {
		var row struct {
			At *string `json:"onboarding_completed_at"`
		}
		onbMust(t, S.DB.From("platform_user").Select("onboarding_completed_at").Eq("id", w.Traveler.PlatformUserID).Single(context.Background(), &row))
		if row.At == nil {
			return ""
		}
		return *row.At
	}
	Run(t, deno, goW, onbCases("onboarding-step", []Case{
		{Name: "GET", Method: "GET", Expect: 400},
		{Name: "an advisor", Token: onbAgent, Body: onbFixed(`{"step":"profile"}`), Expect: 403},
		{Name: "not json", Body: onbFixed(`step=profile`), Expect: 400},
		{Name: "an array", Body: onbFixed(`["profile"]`), Expect: 400},
		{Name: "null", Body: onbFixed(`null`), Expect: 400},
		{Name: "empty", Body: onbFixed(`{}`), Snap: snap, Expect: 400},
		{Name: "unknown step", Body: onbFixed(`{"step":"bogus"}`), Expect: 400},
		{Name: "complete as a string", Body: onbFixed(`{"complete":"true"}`), Expect: 400},
		{Name: "step as a number", Body: onbFixed(`{"step":2}`), Expect: 400},
		{Name: "get started", Body: onbFixed(`{"step":"profile"}`), Snap: snap, Expect: 200},
		{Name: "complete false falls through to the step", Body: onbFixed(`{"step":"connect","complete":false}`), Snap: snap, Expect: 200},
		{Name: "the summary step", Body: onbFixed(`{"step":"complete"}`), Snap: snap, Expect: 200},
		{Name: "finish", Body: onbFixed(`{"complete":true,"step":"bogus"}`), Snap: func(t *testing.T, w *World) string {
			w.Vars["completed_at"] = completedAt(t, w)
			return onbPU(t, w)
		}, Expect: 200},
		{Name: "finish twice keeps the first stamp", Body: onbFixed(`{"complete":true}`), Snap: func(t *testing.T, w *World) string {
			return onbPU(t, w) + "\nrestamped:" + strconv.FormatBool(completedAt(t, w) != w.Vars["completed_at"])
		}, Expect: 200},
		// A step after finishing breaks platform_user_onboarding_finished_has_no_step: a bare
		// 500 on both sides.
		{Name: "a step after finishing", Body: onbFixed(`{"step":"preferences"}`), Snap: snap, Expect: 500},
	}))
}

// ---- onboarding-profile ----

func TestOnboardingProfile(t *testing.T) {
	deno, goW := NewWorlds(t)
	ctx := context.Background()
	snap := func(t *testing.T, w *World) string {
		var row struct {
			Address *string `json:"mailing_address_id"`
		}
		onbMust(t, S.DB.From("client").Select("mailing_address_id").Eq("id", w.Traveler.ClientID).Single(ctx, &row))
		if row.Address != nil && w.Vars["address"] == "" {
			w.Vars["address"] = w.ID("address", *row.Address)
		}
		s := "client:" + S.Rows(t, S.DB.From("client").
			Select("phone,date_of_birth,emergency_contact,mailing_address_id,updated_at,"+
				"address:mailing_address_id(id,line1,line2,city,region,postal_code,country,updated_at)").
			Eq("id", w.Traveler.ClientID))
		s += "\ndocs:" + S.Rows(t, S.DB.From("travel_document").
			Select("client_id,companion_id,document_id,kind,document_number_encrypted,issuing_country,expires_on,archived_at,updated_at").
			Eq("client_id", w.Traveler.ClientID).Order("created_at", true))
		if id := w.Vars["address"]; id != "" {
			s += "\nfirst address:" + S.Rows(t, S.DB.From("address").Select("id,line1").Eq("id", id))
		}
		return s + onbPU(t, w)
	}
	bad := func(name, body string) Case {
		return Case{Name: name, Body: onbFixed(body), Expect: 400}
	}
	Run(t, deno, goW, onbCases("onboarding-profile", []Case{
		{Name: "GET", Method: "GET", Expect: 400},
		{Name: "an advisor", Token: onbAgent, Body: onbFixed(`{}`), Expect: 403},
		{Name: "not json", Body: onbFixed(`{"phone":`), Expect: 400},
		{Name: "an array", Body: onbFixed(`[]`), Snap: snap, Expect: 400},
		bad("phone not text", `{"phone":3055550184}`),
		bad("phone letters", `{"phone":"call me"}`),
		bad("phone too short for +1", `{"phone":"555-0184"}`),
		bad("phone not NANP", `{"phone":"(123) 456-7890"}`),
		bad("date of birth shape", `{"dateOfBirth":"04/02/1990"}`),
		bad("date of birth unreal", `{"dateOfBirth":"1990-02-30"}`),
		bad("emergency contact an array", `{"emergencyContact":[]}`),
		bad("emergency contact half", `{"emergencyContact":{"name":"Ana"}}`),
		bad("emergency contact phone", `{"emergencyContact":{"name":"Ana","phone":"12"}}`),
		bad("emergency contact name not text", `{"emergencyContact":{"name":true,"phone":"+447700900123"}}`),
		bad("address a string", `{"address":"1 Ocean Dr, Miami"}`),
		bad("address without a city", `{"address":{"line1":"1 Ocean Dr","country":"US"}}`),
		bad("address country", `{"address":{"line1":"1 Ocean Dr","city":"Miami","country":"USA"}}`),
		bad("passport an array", `{"passport":[]}`),
		bad("passport number", `{"passport":{"number":"X1234567","expiresOn":"2031-01-31"}}`),
		bad("passport expiry", `{"passport":{"expiresOn":"2031-13-01"}}`),
		{Name: "phone checked before passport", Body: onbFixed(`{"passport":{"number":"1"},"phone":"x"}`), Snap: snap, Expect: 400},
		{Name: "skip for now", Body: onbFixed(`{}`), Snap: snap, Expect: 200},
		{Name: "everything, and advance", Body: onbFixed(`{"phone":"(305) 555-0184","dateOfBirth":"1990-04-02",` +
			`"emergencyContact":{"name":" Ana Ruiz ","phone":"+44 7700 900123","relationship":"Sister"},` +
			`"address":{"line1":"1 Ocean Dr","line2":"","city":"Miami","region":"FL","postalCode":"33139","country":"us"},` +
			`"passport":{"expiresOn":"2031-01-31","issuingCountry":"us"},"advance":true,"clientId":"` + uuid.New() + `"}`),
			Snap: snap, Expect: 200},
		{Name: "edit the address and the passport in place", Body: onbFixed(`{"address":{"line1":"2 Bay Rd","city":"Tampa",` +
			`"country":"US"},"passport":{"expiresOn":"2032-02-29"},"emergencyContact":{"name":"Ana","phone":"3055550100"}}`),
			Snap: snap, Expect: 200},
		{Name: "advance is the boolean true", Body: onbFixed(`{"advance":"yes","phone":"+1 305 555 0199"}`), Snap: snap, Expect: 200},
		{Name: "clear everything", Body: onbFixed(`{"phone":null,"dateOfBirth":"","emergencyContact":{"name":"","phone":null},` +
			`"address":null,"passport":null}`), Snap: snap, Expect: 200},
		{Name: "clear what is already clear", Body: onbFixed(`{"address":{"line1":" "},"passport":{}}`), Snap: snap, Expect: 200},
		{Name: "a new address after clearing", Body: onbFixed(`{"address":{"line1":"3 Elm St","city":"Austin","country":"US"},` +
			`"passport":{"issuingCountry":"CA"}}`), Snap: snap, Expect: 200},
	}))
}

// ---- onboarding-preferences ----

func TestOnboardingPreferences(t *testing.T) {
	deno, goW := NewWorlds(t)
	snap := func(t *testing.T, w *World) string {
		return "pref:" + S.Rows(t, S.DB.From("travel_preference").
			Select("id,client_id,preferred_destinations,travel_styles,dietary_restrictions,dietary_notes,accessibility_needs,"+
				"accessibility_notes,loyalty_programs,budget_band,favorite_past_trips,updated_at").
			Eq("client_id", w.Traveler.ClientID)) + onbPU(t, w)
	}
	bad := func(name, body string) Case { return Case{Name: name, Body: onbFixed(body), Expect: 400} }
	Run(t, deno, goW, onbCases("onboarding-preferences", []Case{
		{Name: "GET", Method: "GET", Expect: 400},
		{Name: "an advisor", Token: onbAgent, Body: onbFixed(`{}`), Expect: 403},
		{Name: "not json", Body: onbFixed(`nope`), Expect: 400},
		bad("destinations not a list", `{"destinations":"Aruba"}`),
		bad("thirteen destinations", `{"destinations":["a","b","c","d","e","f","g","h","i","j","k","l","m"]}`),
		bad("a destination not text", `{"destinations":["Aruba",7]}`),
		bad("a destination too long", `{"destinations":["`+strings.Repeat("x", 61)+`"]}`),
		bad("an unknown style", `{"travelStyles":["spa"]}`),
		bad("seven styles", `{"travelStyles":["resort","cruise","adventure","family","romantic","group","resort"]}`),
		bad("none and halal", `{"dietary":["none","halal"]}`),
		bad("an unknown diet", `{"dietary":["keto"]}`),
		bad("an unknown access need", `{"accessibility":["lift"]}`),
		bad("none beside a note", `{"dietary":["none"],"dietaryNotes":"peanuts"}`),
		bad("none beside an access note", `{"accessibility":["none"],"accessibilityNotes":"ramp"}`),
		bad("notes too long", `{"dietaryNotes":"`+strings.Repeat("x", 501)+`"}`),
		bad("favorites too long", `{"favoritePastTrips":"`+strings.Repeat("x", 1001)+`"}`),
		bad("a budget out of the bands", `{"budgetBand":"cheap"}`),
		bad("loyalty an object", `{"loyalty":{"program":"IHG"}}`),
		bad("eleven programs", `{"loyalty":[`+strings.Repeat(`{"program":"P"},`, 10)+`{"program":"P"}]}`),
		bad("a loyalty entry not an object", `{"loyalty":["IHG 92214"]}`),
		bad("a number with no program", `{"loyalty":[{"number":"92214"}]}`),
		bad("a program too long", `{"loyalty":[{"program":"`+strings.Repeat("x", 61)+`"}]}`),
		bad("a number with a space", `{"loyalty":[{"program":"IHG","number":"92 214"}]}`),
		{Name: "create, and advance", Body: onbFixed(`{"destinations":[" Aruba ","Aruba","Kyoto",""],"travelStyles":["resort","cruise"],` +
			`"dietary":["vegetarian"],"dietaryNotes":"No shellfish, please","accessibility":["none"],` +
			`"favoritePastTrips":"Kyoto in spring","budgetBand":"premium",` +
			`"loyalty":[{"program":" IHG ","number":"92214"},{},{"program":"AAdvantage","number":"4ZE-82Q"},{"program":"Hilton","number":""}],"advance":true}`),
			Snap: snap, Expect: 200},
		{Name: "update part of it", Body: onbFixed(`{"travelStyles":["adventure"],"budgetBand":"mid","accessibilityNotes":""}`), Snap: snap, Expect: 200},
		{Name: "skip for now", Body: onbFixed(`{}`), Snap: snap, Expect: 200},
		// The stored note makes "none" a CHECK violation the function cannot see: a bare 500.
		{Name: "none against a stored note", Body: onbFixed(`{"dietary":["none"]}`), Snap: snap, Expect: 500},
		{Name: "none with the note cleared", Body: onbFixed(`{"dietary":["none"],"dietaryNotes":null}`), Snap: snap, Expect: 200},
		{Name: "clear the lists", Body: onbFixed(`{"destinations":null,"loyalty":null,"budgetBand":"","travelStyles":[]}`), Snap: snap, Expect: 200},
	}))
}

// ---- onboarding-companions ----

func TestOnboardingCompanions(t *testing.T) {
	deno, goW := NewWorlds(t)
	ctx := context.Background()
	// A companion row put straight into the database, labelled.
	newCompanion := func(t *testing.T, w *World, clientID, key, first string, cols js.Ordered) string {
		t.Helper()
		id := uuid.New()
		row := js.O("id", id, "client_id", clientID, "first_name", first, "last_name", "Fixture")
		for _, f := range cols {
			row = row.Set(f.Key, f.Value)
		}
		onbMust(t, S.DB.From("companion").Insert(ctx, row, nil))
		w.ID(key, id)
		w.Vars[key] = id
		return id
	}
	cols := "id,first_name,last_name,relationship,date_of_birth,passport_number_encrypted,passport_expiry,passport_country," +
		"frequent_flyer_numbers,is_invited_to_platform,archived_at,updated_at"
	snap := func(t *testing.T, w *World) string {
		s := "mine:" + S.Rows(t, S.DB.From("companion").Select(cols).Eq("client_id", w.Traveler.ClientID).
			Order("first_name", true).Order("last_name", true))
		if other := w.Vars["other"]; other != "" {
			s += "\ntheirs:" + S.Rows(t, S.DB.From("companion").Select(cols).Eq("client_id", other).Order("first_name", true))
		}
		return s + onbPU(t, w)
	}
	// Another traveler of the same advisor, with one companion of their own.
	theirs := func(t *testing.T, w *World) {
		if w.Vars["other"] == "" {
			onbNewClient(t, w, "other", js.O("first_name", "Other", "last_name", "Traveler"))
			newCompanion(t, w, w.Vars["other"], "theirs", "Stranger", nil)
		}
	}
	mine := func(key, first string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { newCompanion(t, w, w.Traveler.ClientID, key, first, cols) }
	}
	withID := func(key, rest string) func(w *World) string {
		return func(w *World) string { return `{"id":"` + w.Vars[key] + `"` + rest + `}` }
	}
	t.Cleanup(func() {
		for _, w := range []*World{deno, goW} {
			_ = S.DB.From("companion").Eq("client_id", w.Traveler.ClientID).Delete(context.Background(), nil)
		}
	})
	// Fill the household to the cap of 12 unarchived companions.
	fill := func(t *testing.T, w *World) {
		n, err := S.DB.From("companion").Select("id").Eq("client_id", w.Traveler.ClientID).Is("archived_at", nil).Count(ctx)
		onbMust(t, err)
		for i := n; i < 12; i++ {
			newCompanion(t, w, w.Traveler.ClientID, "cap"+strconv.FormatInt(i, 10), "Zcap"+strconv.FormatInt(100+i, 10), nil)
		}
	}
	bad := func(name, body string) Case { return Case{Name: name, Body: onbFixed(body), Expect: 400} }
	sam := `"firstName":" Sam ","lastName":"Lee","relationship":"Son","dateOfBirth":"2014-06-01","passportExpiry":"2030-01-15","passportCountry":"us"`
	Run(t, deno, goW, onbCases("onboarding-companions", []Case{
		{Name: "GET", Method: "GET", Expect: 400},
		{Name: "an advisor", Token: onbAgent, Body: onbFixed(`{"action":"none"}`), Expect: 403},
		{Name: "not json", Body: onbFixed(``), Expect: 400},
		bad("an unknown action", `{"action":"delete"}`),
		bad("action not text", `{"action":1}`),
		bad("add with no names", `{"action":"add"}`),
		bad("add with a blank last name", `{"firstName":"Sam","lastName":"  "}`),
		bad("a name too long", `{"firstName":"`+strings.Repeat("x", 81)+`","lastName":"Lee"}`),
		bad("a relationship too long", `{"firstName":"Sam","lastName":"Lee","relationship":"`+strings.Repeat("x", 41)+`"}`),
		bad("a passport number", `{"firstName":"Sam","lastName":"Lee","passportNumber":"X1"}`),
		bad("a date of birth", `{"firstName":"Sam","lastName":"Lee","dateOfBirth":"2014-02-30"}`),
		bad("a passport country", `{"firstName":"Sam","lastName":"Lee","passportCountry":"USA"}`),
		{Name: "add", Body: onbFixed(`{` + sam + `}`), Snap: snap, Expect: 200},
		{Name: "add, action blank", Body: onbFixed(`{"action":"","firstName":"Ana","lastName":"Lee"}`), Snap: snap, Expect: 200},
		bad("edit with no id", `{"action":"edit","firstName":"Sam","lastName":"Lee"}`),
		bad("edit with a bad id", `{"action":"edit","id":"sam","firstName":"Sam","lastName":"Lee"}`),
		bad("edit checks the names before the id", `{"action":"edit","id":"sam"}`),
		{Name: "edit nobody", Body: func(*World) string {
			return `{"action":"edit","id":"` + uuid.New() + `","firstName":"Sam","lastName":"Lee"}`
		}, Expect: 404},
		{Name: "edit somebody else's", Setup: theirs, Body: withID("theirs", `,"action":"edit","firstName":"Mine","lastName":"Now"`),
			Snap: snap, Expect: 404},
		{Name: "edit my own, a full replace", Setup: mine("edit", "Bea", js.O("relationship", "Aunt", "date_of_birth", "1960-01-01",
			"passport_country", "GB")), Body: withID("edit", `,"action":"edit","firstName":"Beatrice","lastName":"Lee","passportExpiry":"2029-09-09"`),
			Snap: snap, Expect: 200},
		{Name: "edit an archived one", Setup: mine("gone", "Cy", js.O("archived_at", "2026-01-01T00:00:00Z")),
			Body: withID("gone", `,"action":"edit","firstName":"Cy","lastName":"Lee"`), Snap: snap, Expect: 404},
		bad("remove with no id", `{"action":"remove"}`),
		bad("remove with a bad id", `{"action":"remove","id":"12"}`),
		{Name: "remove my own", Setup: mine("rm", "Dee", nil), Body: withID("rm", `,"action":" remove "`), Snap: snap, Expect: 200},
		{Name: "remove it again", Body: withID("rm", `,"action":"remove"`), Snap: snap, Expect: 200},
		{Name: "remove somebody else's", Setup: theirs, Body: withID("theirs", `,"action":"remove"`), Snap: snap, Expect: 200},
		{Name: "remove nobody", Body: func(*World) string { return `{"action":"remove","id":"` + uuid.New() + `"}` }, Expect: 200},
		{Name: "none", Body: onbFixed(`{"action":"none","firstName":7}`), Snap: snap, Expect: 200},
		{Name: "none, and advance", Body: onbFixed(`{"action":"none","advance":true}`), Snap: snap, Expect: 200},
		{Name: "add past the cap", Setup: fill, Body: onbFixed(`{"firstName":"Thirteen","lastName":"Lee"}`), Snap: snap, Expect: 400},
		{Name: "edit at the cap", Body: withID("edit", `,"action":"edit","firstName":"Bea","lastName":"Lee"`), Snap: snap, Expect: 200},
	}))
}

// ---- onboarding-connect ----

func TestOnboardingConnect(t *testing.T) {
	deno, goW := NewWorlds(t)
	ctx := context.Background()

	snap := func(t *testing.T, w *World) string {
		from := w.Traveler.ClientID
		clientCols := "first_name,last_name,preferred_name,phone,date_of_birth,emergency_contact,status,archived_at," +
			"address:mailing_address_id(line1,city,country)"
		prefCols := "id,preferred_destinations,travel_styles,dietary_restrictions,dietary_notes,accessibility_needs," +
			"accessibility_notes,loyalty_programs,budget_band,favorite_past_trips,updated_at"
		s := "throwaway:" + S.Rows(t, S.DB.From("client").Select(clientCols).Eq("id", from))
		s += "\nthrowaway prefs:" + S.Rows(t, S.DB.From("travel_preference").Select(prefCols).Eq("client_id", from))
		s += "\nthrowaway companions:" + S.Rows(t, S.DB.From("companion").Select("first_name").Eq("client_id", from))
		if target := w.Vars["target"]; target != "" {
			s += "\ntarget:" + S.Rows(t, S.DB.From("client").Select(clientCols).Eq("id", target))
			s += "\ntarget prefs:" + S.Rows(t, S.DB.From("travel_preference").Select(prefCols).Eq("client_id", target))
			s += "\ntarget companions:" + S.Rows(t, S.DB.From("companion").Select("first_name,last_name,archived_at").
				Eq("client_id", target).Order("first_name", true))
			s += "\ntarget documents:" + S.Rows(t, S.DB.From("travel_document").Select("kind,expires_on,issuing_country,archived_at").
				Eq("client_id", target).Order("expires_on", true))
		}
		if invite := w.Vars["invite"]; invite != "" {
			s += "\ninvite:" + S.Rows(t, S.DB.From("client_invite").Select("client_id,accepted_at,accepted_account_id,revoked_at").Eq("id", invite))
		}
		return s + onbPU(t, w)
	}
	// fresh starts a case with a new traveler and no target or invite.
	fresh := func(t *testing.T, w *World) {
		delete(w.Vars, "target")
		delete(w.Vars, "invite")
		onbFreshTraveler(t, w)
	}
	// invite makes a target client of the advisor, a fresh traveler and a live invite.
	invite := func(target, inv js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			fresh(t, w)
			id := onbNewClient(t, w, "target", target)
			onbNewInvite(t, w, id, inv)
		}
	}
	code := func(rest string) func(w *World) string {
		return func(w *World) string { return `{"code":"` + w.Vars["code"] + `"` + rest + `}` }
	}
	past := time.Now().Add(-48 * time.Hour).UTC().Format(time.RFC3339)
	nowish := time.Now().UTC().Format(time.RFC3339)

	// The traveler filled in steps 2 to 4 before connecting: all of it must come across.
	filledIn := func(targetPrefs bool) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			invite(js.O("phone", "+13125550100", "preferred_name", nil), nil)(t, w)
			from, to := w.Traveler.ClientID, w.Vars["target"]
			addr := uuid.New()
			onbMust(t, S.DB.From("address").Insert(ctx, js.O("id", addr, "line1", "1 Ocean Dr", "city", "Miami", "country", "US"), nil))
			w.ID("address", addr)
			onbMust(t, S.DB.From("client").Eq("id", from).Update(ctx, js.O("phone", "+13055550184", "date_of_birth", "1990-04-02",
				"preferred_name", "Mo", "mailing_address_id", addr,
				"emergency_contact", js.O("name", "Ana", "phone", "+447700900123", "relationship", nil)), nil))
			pref := w.ID("pref.from", uuid.New())
			onbMust(t, S.DB.From("travel_preference").Insert(ctx, js.O("id", pref, "client_id", from,
				"preferred_destinations", []string{"Aruba"}, "dietary_restrictions", []string{"vegetarian"},
				"budget_band", "mid", "favorite_past_trips", "Kyoto",
				"loyalty_programs", []js.Ordered{js.O("program", "IHG", "number", "92214", "tier", nil)}), nil))
			if targetPrefs {
				tp := w.ID("pref.target", uuid.New())
				onbMust(t, S.DB.From("travel_preference").Insert(ctx, js.O("id", tp, "client_id", to,
					"preferred_destinations", []string{"Rome"}, "dietary_notes", "Shellfish allergy (told Gyasi by phone)",
					"travel_styles", []string{"cruise"}), nil))
			}
			onbMust(t, S.DB.From("companion").Insert(ctx, js.O("id", uuid.New(), "client_id", from, "first_name", "Sam", "last_name", "Lee"), nil))
			onbMust(t, S.DB.From("companion").Insert(ctx, js.O("id", uuid.New(), "client_id", to, "first_name", "Ari", "last_name", "Carter"), nil))
			onbMust(t, S.DB.From("travel_document").Insert(ctx, js.O("id", uuid.New(), "client_id", from, "kind", "passport",
				"expires_on", "2031-01-31", "issuing_country", "US"), nil))
		}
	}

	Run(t, deno, goW, onbCases("onboarding-connect", []Case{
		{Name: "GET", Method: "GET", Expect: 400},
		{Name: "an advisor", Token: onbAgent, Body: onbFixed(`{"code":"STA-7HX2J9"}`), Expect: 403},
		{Name: "not json", Body: onbFixed(`STA-7HX2J9`), Expect: 400},
		{Name: "code not text", Body: onbFixed(`{"code":123456}`), Expect: 400},
		{Name: "no code", Setup: fresh, Body: onbFixed(`{}`), Snap: snap, Expect: 200},
		{Name: "a blank code, and advance", Setup: fresh, Body: onbFixed(`{"code":"  ","advance":true}`), Snap: snap, Expect: 200},
		{Name: "a code nothing matches", Setup: fresh, Body: func(*World) string { return `{"code":"NOPE-` + Unique() + `"}` },
			Snap: snap, Expect: 400},
		{Name: "an expired code", Setup: invite(nil, js.O("expires_at", past)), Body: code(``), Snap: snap, Expect: 400},
		{Name: "a revoked code", Setup: invite(nil, js.O("revoked_at", nowish)), Body: code(``), Snap: snap, Expect: 400},
		{Name: "a used code", Setup: func(t *testing.T, w *World) {
			fresh(t, w)
			id := onbNewClient(t, w, "target", nil)
			onbNewInvite(t, w, id, js.O("accepted_at", nowish, "accepted_account_id", w.Agent.UserID))
		}, Body: code(``), Snap: snap, Expect: 400},
		{Name: "my own record", Setup: func(t *testing.T, w *World) {
			fresh(t, w)
			onbNewInvite(t, w, w.Traveler.ClientID, nil)
		}, Body: code(``), Snap: snap, Expect: 400},
		{Name: "a record another account holds", Setup: func(t *testing.T, w *World) {
			holder := S.NewTraveler(t, Unique(), w.Agent)
			w.ID("holder.client", holder.ClientID)
			w.ID("holder.pu", holder.PlatformUserID)
			fresh(t, w)
			onbNewInvite(t, w, holder.ClientID, nil)
		}, Body: code(``), Snap: snap, Expect: 400},
		{Name: "rate limited", Setup: func(t *testing.T, w *World) {
			invite(nil, nil)(t, w)
			onbAttempts(t, w, 10, "unknown", time.Now().Add(-time.Minute))
		}, Body: code(``), Snap: snap, Expect: 403},
		{Name: "refusals do not feed the limit", Setup: func(t *testing.T, w *World) {
			fresh(t, w)
			onbAttempts(t, w, 9, "unknown", time.Now().Add(-time.Minute))
			onbAttempts(t, w, 5, "rate_limited", time.Now().Add(-time.Minute))
		}, Body: func(*World) string { return `{"code":"NOPE-` + Unique() + `"}` }, Snap: snap, Expect: 400},
		{Name: "old attempts have aged out", Setup: func(t *testing.T, w *World) {
			invite(nil, nil)(t, w)
			onbAttempts(t, w, 12, "unknown", time.Now().Add(-16*time.Minute))
		}, Body: code(``), Snap: snap, Expect: 200},
		{Name: "a plain redemption, typed loosely", Setup: invite(js.O("first_name", " maya", "last_name", "carter "), nil),
			Body: func(w *World) string {
				loose := " " + strings.ToLower(strings.ReplaceAll(w.Vars["code"], "-", " ")) + " "
				return `{"code":"` + loose + `"}`
			}, Snap: snap, Expect: 200},
		{Name: "everything comes across, merged", Setup: filledIn(true), Body: code(`,"advance":true`), Snap: snap, Expect: 200},
		{Name: "everything comes across, moved", Setup: filledIn(false), Body: code(``), Snap: snap, Expect: 200},
		// Each case's fixtures are removed when it ends, so the first redemption runs in this
		// case's Setup, through the world's own implementation; only the second is compared.
		{Name: "the same code again", Setup: func(t *testing.T, w *World) {
			filledIn(true)(t, w)
			body, h := `{"code":"`+w.Vars["code"]+`"}`, Bearer(w.Traveler.Token)
			h.Set("User-Agent", "difftest-first-redemption")
			send := S.GoDoor
			if w.Name == "deno" {
				send = S.Deno
			}
			r := send("POST", "onboarding-connect", "", body, h)
			if r.Status != http.StatusOK {
				t.Fatalf("first redemption = %d %s", r.Status, r.Body)
			}
		}, Body: code(`,"advance":true`), Snap: snap, Expect: 400},
	}))
}
