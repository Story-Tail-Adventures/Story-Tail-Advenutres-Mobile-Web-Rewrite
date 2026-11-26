package agentclientnotes

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
		EventType string          `json:"event_type"`
		TargetID  string          `json:"target_id"`
		Metadata  json.RawMessage `json:"metadata"`
	}
	b, _ := json.Marshal(rows)
	if err := json.Unmarshal(b, &r); err != nil {
		return err
	}
	f.audits = append(f.audits, r.EventType+" "+r.TargetID+" "+string(r.Metadata))
	return nil
}

const (
	agentID  = "a0000000-0000-7000-8000-000000000001"
	clientID = "c0000000-0000-7000-8000-000000000002"
	noteID   = "e0000000-0000-7000-8000-000000000003"
)

var actor = &caller.Context{PlatformUserID: "pu-1", Role: "agent"}

func run(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	newID = func() string { return "new-note" }
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
	c := `"clientId":"` + clientID + `"`
	cases := []struct{ body, detail string }{
		{`{}`, "That is not a client id."},
		{`{"clientId":"x","op":"nope"}`, "That is not a client id."},
		{`{` + c + `}`, "op must be create, update or archive."},
		{`{` + c + `,"op":"delete"}`, "op must be create, update or archive."},
		{`{` + c + `,"op":"update"}`, "That is not a note id."},
		{`{` + c + `,"op":"archive","noteId":7}`, "That is not a note id."},
		{`{` + c + `,"op":"create"}`, "A note needs something in it."},
		{`{` + c + `,"op":"create","body":" \n\t "}`, "A note needs something in it."},
		{`{` + c + `,"op":"update","noteId":"` + noteID + `","body":5}`, "A note needs something in it."},
		{`{` + c + `,"op":"create","body":"` + strings.Repeat("x", 4001) + `"}`, "That note is too long."},
		{`{` + c + `,"op":"create","body":"` + strings.Repeat("\U0001F600", 2001) + `"}`, "That note is too long."},
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
	c := `"clientId":"` + clientID + `"`
	cases := []struct {
		body, reply, call, want, audit string
		status                         int
	}{
		{body: `{` + c + `,"op":"create","body":" Call back "}`, reply: `[{"outcome":"created","note_id":"new-note"}]`,
			call:  `{"p_client_id":"` + clientID + `","p_agent_id":"` + agentID + `","p_actor_user_id":"pu-1","p_note_id":"new-note","p_body":" Call back ","p_op":"create"}`,
			want:  `{"clientId":"` + clientID + `","noteId":"new-note","changed":true,"outcome":"created"}`,
			audit: `client.note_created ` + clientID + ` {"note_id":"new-note"}`},
		{body: `{` + c + `,"op":"update","noteId":"` + noteID + `","body":"x"}`, reply: `[{"outcome":"noop","note_id":"` + noteID + `"}]`,
			want: `{"clientId":"` + clientID + `","noteId":"` + noteID + `","changed":false}`},
		{body: `{` + c + `,"op":"update","noteId":"` + noteID + `","body":"x"}`, reply: `[{"outcome":"changed","note_id":"` + noteID + `"}]`,
			want:  `{"clientId":"` + clientID + `","noteId":"` + noteID + `","changed":true,"outcome":"changed"}`,
			audit: `client.note_changed ` + clientID + ` {"note_id":"` + noteID + `"}`},
		{body: `{` + c + `,"op":"archive","noteId":"` + noteID + `","body":"ignored"}`, reply: `[{"outcome":"archived","note_id":"` + noteID + `"}]`,
			call:  `{"p_client_id":"` + clientID + `","p_agent_id":"` + agentID + `","p_actor_user_id":"pu-1","p_note_id":"` + noteID + `","p_body":null,"p_op":"archive"}`,
			want:  `{"clientId":"` + clientID + `","noteId":"` + noteID + `","changed":true,"outcome":"archived"}`,
			audit: `client.note_archived ` + clientID + ` {"note_id":"` + noteID + `"}`},
		{body: `{` + c + `,"op":"archive","noteId":"` + noteID + `"}`, reply: `[]`, status: 404},
		{body: `{` + c + `,"op":"archive","noteId":"` + noteID + `"}`, reply: `[{"outcome":"exploded","note_id":null}]`, status: 500},
	}
	for _, tc := range cases {
		db := &fakeDB{reply: tc.reply}
		got, err := run(t, db, tc.body)
		switch tc.status {
		case 404:
			if p, ok := problem.As(err); !ok || p.Status != 404 || p.Detail != "No such client or note." {
				t.Errorf("%s: %v", tc.body, err)
			}
		case 500:
			if _, ok := problem.As(err); err == nil || ok {
				t.Errorf("%s: want a bare 500, got %v", tc.body, err)
			}
		default:
			if err != nil || got != tc.want {
				t.Errorf("%s: %s %v", tc.body, got, err)
			}
		}
		if tc.call != "" && db.calls[0] != "agent_write_client_note "+tc.call {
			t.Errorf("call %s", db.calls[0])
		}
		if (tc.audit == "" && len(db.audits) != 0) || (tc.audit != "" && (len(db.audits) != 1 || db.audits[0] != tc.audit)) {
			t.Errorf("%s: audits %v", tc.body, db.audits)
		}
	}
}
