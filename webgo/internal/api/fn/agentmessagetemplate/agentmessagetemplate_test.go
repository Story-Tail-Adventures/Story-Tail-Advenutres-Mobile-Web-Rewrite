package agentmessagetemplate

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

type fakeDB struct {
	reply string
	calls []string
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

const (
	agentID = "a0000000-0000-7000-8000-000000000001"
	oldID   = "c0000000-0000-7000-8000-000000000002" // shaped like a v7, its timestamp centuries away
)

var now = time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)

func run(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := handle(context.Background(), db, agentID, v, now)
	if err != nil {
		return "", err
	}
	b, _ := js.Marshal(reply.Body)
	return string(b), nil
}

func TestValidation(t *testing.T) {
	fresh := uuid.NewAt(now)
	ok := `"category":"proposal","name":"N","body":"Hi"`
	cases := []struct{ body, detail string }{
		{`{}`, "Send an op of create, update, duplicate, archive."},
		{`{"op":"delete"}`, "Send an op of create, update, duplicate, archive."},
		{`{"op":"create"}`, "Send the new template with its id."},
		{`{"op":"create","templateId":5}`, "Send the new template with its id."},
		{`{"op":"create","templateId":"x"}`, "That form is out of date. Reload the page and try again."},
		{`{"op":"create","templateId":"` + oldID + `"}`, "That form is out of date. Reload the page and try again."},
		{`{"op":"create","templateId":"` + uuid.NewAt(now.Add(2*time.Hour)) + `"}`, "That form is out of date. Reload the page and try again."},
		{`{"op":"create","templateId":"` + uuid.NewAt(now.Add(-61*time.Minute)) + `"}`, "That form is out of date. Reload the page and try again."},
		{`{"op":"create","templateId":"` + fresh + `"}`, "Pick a category for this template."},
		{`{"op":"create","templateId":"` + fresh + `","category":"spam"}`, "Pick a category for this template."},
		{`{"op":"create","templateId":"` + fresh + `","category":"other"}`, "A template needs a name."},
		{`{"op":"create","templateId":"` + fresh + `","category":"other","name":"` + strings.Repeat("n", 81) + `"}`, "Keep the name to 80 characters."},
		{`{"op":"create","templateId":"` + fresh + `","category":"other","name":"N","body":" "}`, "A template needs something in it."},
		{`{"op":"create","templateId":"` + fresh + `","category":"other","name":"N","body":"{{client.lastName}}"}`, "{{client.lastName}} isn't a merge field. Pick from the list under the message."},
		{`{"op":"create","templateId":"` + fresh + `",` + ok + `,"tags":"x"}`, "Tags must be a list of words."},
		{`{"op":"update","templateId":"x",` + ok + `}`, "That is not a template id."},
		{`{"op":"update","templateId":"` + oldID + `"}`, "Pick a category for this template."},
		{`{"op":"duplicate","templateId":"` + fresh + `"}`, "Send the new template with its id."},
		{`{"op":"duplicate","templateId":"no","newTemplateId":"` + fresh + `"}`, "That is not a template id."},
		{`{"op":"duplicate","templateId":"` + oldID + `","newTemplateId":"` + oldID + `"}`, "That form is out of date. Reload the page and try again."},
		{`{"op":"archive","templateId":"` + oldID + `"}`, "archived must be true or false."},
		{`{"op":"archive","templateId":1,"archived":true}`, "That is not a template id."},
	}
	for _, tc := range cases {
		db := &fakeDB{}
		_, err := run(t, db, tc.body)
		p, isProblem := problem.As(err)
		if !isProblem || p.Status != 400 || p.Detail != tc.detail {
			t.Errorf("%s: %v, want %q", tc.body, err, tc.detail)
		}
		if len(db.calls) != 0 {
			t.Errorf("%s reached the database", tc.body)
		}
	}
}

func TestOps(t *testing.T) {
	fresh := uuid.NewAt(now.Add(-30 * time.Minute))
	fields := `"category":"pre_trip","name":"  Packing list ","body":"Hi {{ client.firstName }},\n\n","tags":[" Beach ","beach",""]`
	cases := []struct {
		body, reply, call, want string
		status                  int
	}{
		{body: `{"op":"create","templateId":"` + fresh + `",` + fields + `}`, reply: `[{"outcome":"created"}]`,
			call: `agent_create_message_template {"p_template_id":"` + fresh + `","p_agent_id":"` + agentID + `","p_category":"pre_trip",` +
				`"p_name":"Packing list","p_body":"Hi {{ client.firstName }},\n\n","p_tags":["Beach"]}`,
			want: `{"outcome":"created","templateId":"` + fresh + `"}`},
		{body: `{"op":"create","templateId":"` + fresh + `",` + fields + `}`, reply: `[{"outcome":"exists"}]`,
			want: `{"outcome":"exists","templateId":"` + fresh + `"}`},
		{body: `{"op":"create","templateId":"` + fresh + `",` + fields + `}`, reply: `[{"outcome":"conflict"}]`, status: 404},
		{body: `{"op":"update","templateId":"` + oldID + `",` + fields + `}`, reply: `[{"outcome":"noop"}]`,
			call: `agent_update_message_template {"p_template_id":"` + oldID + `","p_agent_id":"` + agentID + `","p_category":"pre_trip",` +
				`"p_name":"Packing list","p_body":"Hi {{ client.firstName }},\n\n","p_tags":["Beach"]}`,
			want: `{"outcome":"noop","templateId":"` + oldID + `"}`},
		{body: `{"op":"update","templateId":"` + oldID + `",` + fields + `}`, reply: `[{"outcome":"not_found"}]`, status: 404},
		{body: `{"op":"update","templateId":"` + oldID + `",` + fields + `}`, reply: `[]`, status: 404},
		{body: `{"op":"update","templateId":"` + oldID + `",` + fields + `}`, reply: `[{"outcome":null}]`,
			want: `{"outcome":"null","templateId":"` + oldID + `"}`},
		{body: `{"op":"update","templateId":"` + oldID + `",` + fields + `}`, reply: `[{"other":1}]`, status: 404},
		{body: `{"op":"duplicate","templateId":"` + oldID + `","newTemplateId":"` + fresh + `"}`, reply: `[{"outcome":"created"}]`,
			call: `agent_duplicate_message_template {"p_source_id":"` + oldID + `","p_new_id":"` + fresh + `","p_agent_id":"` + agentID + `"}`,
			want: `{"outcome":"created","templateId":"` + fresh + `"}`},
		{body: `{"op":"duplicate","templateId":"` + oldID + `","newTemplateId":"` + fresh + `"}`, reply: `[{"outcome":"not_found"}]`, status: 404},
		{body: `{"op":"archive","templateId":"` + oldID + `","archived":false}`, reply: `[{"outcome":"changed"}]`,
			call: `agent_set_message_template_archived {"p_template_id":"` + oldID + `","p_agent_id":"` + agentID + `","p_archived":false}`,
			want: `{"outcome":"changed"}`},
		{body: `{"op":"archive","templateId":"` + oldID + `","archived":true}`, reply: `[{"outcome":"conflict"}]`, want: `{"outcome":"conflict"}`},
		{body: `{"op":"archive","templateId":"` + oldID + `","archived":true}`, reply: `[{"outcome":"not_found"}]`, status: 404},
	}
	for _, tc := range cases {
		db := &fakeDB{reply: tc.reply}
		got, err := run(t, db, tc.body)
		if tc.status != 0 {
			if p, ok := problem.As(err); !ok || p.Status != 404 || p.Detail != notInLibrary {
				t.Errorf("%s / %s: %v", tc.body, tc.reply, err)
			}
		} else if err != nil || got != tc.want {
			t.Errorf("%s / %s: %s %v", tc.body, tc.reply, got, err)
		}
		if tc.call != "" && db.calls[0] != tc.call {
			t.Errorf("call %s\nwant %s", db.calls[0], tc.call)
		}
	}
}
