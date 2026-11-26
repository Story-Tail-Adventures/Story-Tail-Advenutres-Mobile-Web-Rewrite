package agenttemplate

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

type fakeDB struct {
	reply  string
	calls  []string
	audits []string
}

func (f *fakeDB) RPCRow(_ context.Context, fn string, args any, out any) (bool, error) {
	b, _ := js.Marshal(args)
	f.calls = append(f.calls, fn+" "+string(b))
	var rows []json.RawMessage
	if err := json.Unmarshal([]byte(f.reply), &rows); err != nil {
		return false, err
	}
	if len(rows) == 0 {
		return false, nil
	}
	return true, json.Unmarshal(rows[0], out)
}

func (f *fakeDB) InsertRows(_ context.Context, _ string, rows any) error {
	var r struct {
		EventType    string          `json:"event_type"`
		TargetEntity string          `json:"target_entity"`
		TargetID     string          `json:"target_id"`
		Metadata     json.RawMessage `json:"metadata"`
	}
	b, _ := json.Marshal(rows)
	if err := json.Unmarshal(b, &r); err != nil {
		return err
	}
	f.audits = append(f.audits, r.EventType+" "+r.TargetEntity+"/"+r.TargetID+" "+string(r.Metadata))
	return nil
}

const (
	agentID    = "a0000000-0000-7000-8000-000000000001"
	tripID     = "b0000000-0000-7000-8000-000000000002"
	templateID = "c0000000-0000-7000-8000-000000000003"
)

var actor = &caller.Context{PlatformUserID: "pu-1", Role: "agent"}

func run(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := handle(context.Background(), db, actor, agentID, v)
	if err != nil {
		return "", err
	}
	b, _ := js.Marshal(reply.Body)
	return string(b), nil
}

func TestValidation(t *testing.T) {
	trip := `"tripId":"` + tripID + `"`
	tmpl := `"templateId":"` + templateID + `"`
	cases := []struct{ body, detail string }{
		{`{}`, "op must be one of save, update, archive, apply."},
		{`{"op":"Save"}`, "op must be one of save, update, archive, apply."},
		{`{"op":"save"}`, "That is not a trip id."},
		{`{"op":"save",` + trip + `}`, "A template needs a name."},
		{`{"op":"save",` + trip + `,"name":"  "}`, "A template needs a name."},
		{`{"op":"save",` + trip + `,"name":3}`, "A template needs a name."},
		{`{"op":"save",` + trip + `,"name":"` + strings.Repeat("n", 121) + `"}`, "A template name is at most 120 characters."},
		{`{"op":"save",` + trip + `,"name":"N","description":7}`, "A description must be text."},
		{`{"op":"save",` + trip + `,"name":"N","description":"` + strings.Repeat("d", 501) + `"}`, "A description is at most 500 characters."},
		{`{"op":"update",` + trip + `,"name":"N"}`, "That is not a template id."},
		{`{"op":"update",` + tmpl + `}`, "A template needs a name."},
		{`{"op":"archive","templateId":"x"}`, "That is not a template id."},
		{`{"op":"apply",` + trip + `}`, "That is not a template id."},
		{`{"op":"apply",` + tmpl + `}`, "That is not a trip id."},
	}
	for _, tc := range cases {
		db := &fakeDB{}
		_, err := run(t, db, tc.body)
		p, ok := problem.As(err)
		if !ok || p.Status != 400 || p.Detail != tc.detail {
			t.Errorf("%s: %v, want %q", tc.body, err, tc.detail)
		}
		if len(db.calls) != 0 {
			t.Errorf("%s reached the database", tc.body)
		}
	}
}

func TestOps(t *testing.T) {
	trip := `"tripId":"` + tripID + `"`
	tmpl := `"templateId":"` + templateID + `"`
	cases := []struct {
		name, body, reply, call, want, audit string
		status                               int
		detail                               string
	}{
		{name: "save, blank description left out", body: `{"op":"save",` + trip + `,"name":" Honeymoon ","description":"  "}`,
			reply: `[{"template_id":"T1","components_saved":2,"days_saved":5}]`,
			call:  `agent_save_trip_as_template {"p_trip_id":"` + tripID + `","p_agent_id":"` + agentID + `","p_name":"Honeymoon"}`,
			want:  `{"templateId":"T1","componentsSaved":2,"daysSaved":5}`,
			audit: `trip_template.created trip_template/T1 {"from_trip_id":"` + tripID + `","components_saved":2,"days_saved":5}`},
		{name: "save, description", body: `{"op":"save",` + trip + `,"name":"H","description":" Five nights "}`,
			reply: `[{"template_id":"T1","components_saved":0,"days_saved":0}]`,
			call:  `agent_save_trip_as_template {"p_trip_id":"` + tripID + `","p_agent_id":"` + agentID + `","p_name":"H","p_description":"Five nights"}`,
			want:  `{"templateId":"T1","componentsSaved":0,"daysSaved":0}`,
			audit: `trip_template.created trip_template/T1 {"from_trip_id":"` + tripID + `","components_saved":0,"days_saved":0}`},
		{name: "save, not yours", body: `{"op":"save",` + trip + `,"name":"H"}`, reply: `[]`, status: 404, detail: "That trip is not on your board."},
		{name: "update changed", body: `{"op":"update",` + tmpl + `,"name":"H","description":null}`, reply: `[{"outcome":"changed"}]`,
			call:  `agent_update_template {"p_template_id":"` + templateID + `","p_agent_id":"` + agentID + `","p_name":"H"}`,
			want:  `{"outcome":"changed"}`,
			audit: `trip_template.updated trip_template/` + templateID + ` {"outcome":"changed"}`},
		{name: "update noop", body: `{"op":"update",` + tmpl + `,"name":"H"}`, reply: `[{"outcome":"noop"}]`, want: `{"outcome":"noop"}`},
		{name: "update not found", body: `{"op":"update",` + tmpl + `,"name":"H"}`, reply: `[{"outcome":"not_found"}]`, status: 404, detail: notInLibrary},
		{name: "archive", body: `{"op":"archive",` + tmpl + `}`, reply: `[{"outcome":"archived"}]`,
			call:  `agent_archive_template {"p_template_id":"` + templateID + `","p_agent_id":"` + agentID + `"}`,
			want:  `{"outcome":"archived"}`,
			audit: `trip_template.archived trip_template/` + templateID + ` {}`},
		{name: "archive not found", body: `{"op":"archive",` + tmpl + `}`, reply: `[{"outcome":"not_found"}]`, status: 404, detail: notInLibrary},
		{name: "apply", body: `{"op":"apply",` + tmpl + `,` + trip + `}`,
			reply: `[{"outcome":"applied","components_added":2,"days_added":3,"activities_added":4}]`,
			call:  `agent_apply_template {"p_template_id":"` + templateID + `","p_trip_id":"` + tripID + `","p_agent_id":"` + agentID + `"}`,
			want:  `{"outcome":"applied","componentsAdded":2,"daysAdded":3,"activitiesAdded":4}`,
			audit: `trip.seeded_from_template trip/` + tripID + ` {"template_id":"` + templateID + `","components_added":2,"days_added":3,"activities_added":4}`},
		{name: "apply again", body: `{"op":"apply",` + tmpl + `,` + trip + `}`,
			reply: `[{"outcome":"already_applied","components_added":0,"days_added":0,"activities_added":0}]`,
			want:  `{"outcome":"already_applied","componentsAdded":0,"daysAdded":0,"activitiesAdded":0}`},
		{name: "apply not yours", body: `{"op":"apply",` + tmpl + `,` + trip + `}`,
			reply:  `[{"outcome":"not_found","components_added":0,"days_added":0,"activities_added":0}]`,
			status: 404, detail: "That template or trip is not yours."},
	}
	for _, tc := range cases {
		db := &fakeDB{reply: tc.reply}
		got, err := run(t, db, tc.body)
		if tc.status != 0 {
			if p, ok := problem.As(err); !ok || p.Status != tc.status || p.Detail != tc.detail {
				t.Errorf("%s: %v", tc.name, err)
			}
		} else if err != nil || got != tc.want {
			t.Errorf("%s: %s %v", tc.name, got, err)
		}
		if tc.call != "" && db.calls[0] != tc.call {
			t.Errorf("%s: call %s", tc.name, db.calls[0])
		}
		if (tc.audit == "" && len(db.audits) != 0) || (tc.audit != "" && (len(db.audits) != 1 || db.audits[0] != tc.audit)) {
			t.Errorf("%s: audits %v", tc.name, db.audits)
		}
	}
}
