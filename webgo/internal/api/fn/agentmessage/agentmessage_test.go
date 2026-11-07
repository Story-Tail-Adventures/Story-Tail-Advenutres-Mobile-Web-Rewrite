package agentmessage

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

type fakeDB struct {
	reply  string
	err    error
	calls  []string
	audits []string
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	b, _ := js.Marshal(args)
	f.calls = append(f.calls, fn+" "+string(b))
	if f.err != nil {
		return f.err
	}
	return json.Unmarshal([]byte(f.reply), out)
}

func (f *fakeDB) RPCRow(ctx context.Context, fn string, args any, out any) (bool, error) {
	var raw json.RawMessage
	if err := f.RPC(ctx, fn, args, &raw); err != nil {
		return false, err
	}
	var rows []json.RawMessage
	if json.Unmarshal(raw, &rows) != nil || len(rows) == 0 {
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
	agentID = "a0000000-0000-7000-8000-000000000001"
	conv    = "c0000000-0000-7000-8000-000000000002"
	client  = "d0000000-0000-7000-8000-000000000003"
	trip    = "e0000000-0000-7000-8000-000000000004"
	seen    = "2026-11-07 11:59:00.123456+00"
)

var (
	now   = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	actor = &caller.Context{PlatformUserID: "pu-1", Role: "agent"}
	msgID = uuid.NewAt(now.Add(-time.Minute))
)

func run(t *testing.T, db *fakeDB, body string) (int, string, error) {
	t.Helper()
	newID = func() string { return "new-thread" }
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := handle(context.Background(), db, actor, agentID, v, now)
	if err != nil {
		return 0, "", err
	}
	b, _ := js.Marshal(reply.Body)
	return reply.Status, string(b), nil
}

func TestValidation(t *testing.T) {
	ok := `"body":"Hi","internalNote":false,"messageId":"` + msgID + `"`
	cases := []struct{ body, detail string }{
		{`{}`, "Send an op of send, read, archive."},
		{`{"op":"reply"}`, "Send an op of send, read, archive."},
		{`{"op":"send"}`, "Say which thread or which client this is for."},
		{`{"op":"send","conversationId":"x"}`, "That is not a thread id."},
		{`{"op":"send","conversationId":"` + conv + `","clientId":"` + client + `"}`, "Send a thread, or a client and trip, not both."},
		{`{"op":"send","clientId":"` + client + `","tripId":"t"}`, "That is not a trip id."},
		{`{"op":"send","conversationId":"` + conv + `","body":"  "}`, "A message needs something in it."},
		{`{"op":"send","conversationId":"` + conv + `","body":"` + strings.Repeat("b", 8001) + `"}`, "Keep it under 8,000 characters."},
		{`{"op":"send","conversationId":"` + conv + `","body":"Due {{payment.dueDate}} {{ trip.name }}"}`,
			"Fill in {{payment.dueDate}}, {{trip.name}} before sending. It came from the template and has no value here."},
		{`{"op":"send","conversationId":"` + conv + `","body":"Hi"}`, "internalNote must be true or false."},
		{`{"op":"send","conversationId":"` + conv + `","body":"Hi","internalNote":true}`, "Send the message with its id."},
		{`{"op":"send","conversationId":"` + conv + `","body":"Hi","internalNote":true,"messageId":"` + uuid.NewAt(now.Add(-2*time.Hour)) + `"}`,
			"That message is out of date. Copy it and send it again."},
		{`{"op":"send","conversationId":"` + conv + `",` + ok + `,"seenUpTo":"yesterday"}`, "seenUpTo must be a timestamp."},
		{`{"op":"read"}`, "That is not a thread id."},
		{`{"op":"read","conversationId":"` + conv + `"}`, "Say which message was the newest on screen."},
		{`{"op":"archive"}`, "Pick at least one thread."},
		{`{"op":"archive","conversationIds":["` + conv + `",5]}`, "That is not a thread id."},
		{`{"op":"archive","conversationIds":["` + conv + `"]}`, "Say whether to archive or bring back."},
	}
	for _, c := range cases {
		db := &fakeDB{}
		_, _, err := run(t, db, c.body)
		p, isProblem := problem.As(err)
		if !isProblem || p.Status != 400 || p.Detail != c.detail {
			t.Errorf("%s: %v, want %q", c.body, err, c.detail)
		}
		if len(db.calls) != 0 {
			t.Errorf("%s reached the database", c.body)
		}
	}
}

func TestSend(t *testing.T) {
	sent := `[{"outcome":"sent","conversation_id":"` + conv + `","created_at":"2026-11-07T12:00:00.123456+00:00"}]`
	cases := []struct {
		name, body, call, audit string
	}{
		{"into a thread", `{"op":"send","conversationId":"` + conv + `","body":" Hi ","internalNote":false,"messageId":"` + msgID + `","seenUpTo":"` + seen + `"}`,
			`{"p_agent_id":"` + agentID + `","p_actor_user_id":"pu-1","p_message_id":"` + msgID + `","p_body":"Hi","p_is_internal_note":false,` +
				`"p_seen_up_to":"` + seen + `","p_conversation_id":"` + conv + `"}`,
			`{"conversationId":"` + conv + `","internalNote":false}`},
		{"to a client", `{"op":"send","clientId":"` + client + `","conversationId":null,"body":"Hi","internalNote":true,"messageId":"` + msgID + `"}`,
			`{"p_agent_id":"` + agentID + `","p_actor_user_id":"pu-1","p_message_id":"` + msgID + `","p_body":"Hi","p_is_internal_note":true,` +
				`"p_client_id":"` + client + `","p_new_conversation_id":"new-thread"}`,
			`{"conversationId":"` + conv + `","internalNote":true,"clientId":"` + client + `","tripId":null}`},
		{"to a client's trip", `{"op":"send","clientId":"` + client + `","tripId":"` + trip + `","body":"Hi {{client.lastName}}","internalNote":false,"messageId":"` + msgID + `"}`,
			`{"p_agent_id":"` + agentID + `","p_actor_user_id":"pu-1","p_message_id":"` + msgID + `","p_body":"Hi {{client.lastName}}","p_is_internal_note":false,` +
				`"p_client_id":"` + client + `","p_trip_id":"` + trip + `","p_new_conversation_id":"new-thread"}`,
			`{"conversationId":"` + conv + `","internalNote":false,"clientId":"` + client + `","tripId":"` + trip + `"}`},
	}
	for _, c := range cases {
		db := &fakeDB{reply: sent}
		status, got, err := run(t, db, c.body)
		if err != nil || status != 201 || got != `{"messageId":"`+msgID+`","conversationId":"`+conv+`","createdAt":"2026-11-07T12:00:00.123456+00:00"}` {
			t.Errorf("%s: %d %s %v", c.name, status, got, err)
		}
		if db.calls[0] != "agent_send_message "+c.call {
			t.Errorf("%s: call %s", c.name, db.calls[0])
		}
		if len(db.audits) != 1 || db.audits[0] != "message.created "+msgID+" "+c.audit {
			t.Errorf("%s: audits %v", c.name, db.audits)
		}
	}

	body := `{"op":"send","conversationId":"` + conv + `","body":"Hi","internalNote":true,"messageId":"` + msgID + `"}`
	for reply, want := range map[string]struct {
		status int
		detail string
	}{
		`[]`: {404, "That thread or client isn't one of yours, or it's gone."},
		`[{"outcome":"note_needs_thread","conversation_id":null,"created_at":null}]`: {400, "Start the thread with a message they can read. Notes can go in after that."},
		`[{"outcome":"exploded","conversation_id":null,"created_at":null}]`:          {500, ""},
	} {
		db := &fakeDB{reply: reply}
		_, _, err := run(t, db, body)
		p, isProblem := problem.As(err)
		if want.status == 500 {
			if err == nil || isProblem {
				t.Errorf("%s: want a bare 500, got %v", reply, err)
			}
		} else if !isProblem || p.Status != want.status || p.Detail != want.detail {
			t.Errorf("%s: %v", reply, err)
		}
		if len(db.audits) != 0 {
			t.Errorf("%s: audited", reply)
		}
	}

	db := &fakeDB{err: &service.Error{Status: 409, Code: "23505", Message: `duplicate key value violates unique constraint "message_pkey"`}}
	_, _, err := run(t, db, body)
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "That message was already sent." {
		t.Errorf("a repeat: %v", err)
	}
	db = &fakeDB{err: &service.Error{Status: 409, Code: "23505", Message: `duplicate key value violates unique constraint "conversation_pkey"`}}
	_, _, err = run(t, db, body)
	if _, ok := problem.As(err); err == nil || ok || !strings.HasPrefix(err.Error(), "agent send failed: ") {
		t.Errorf("another clash: %v", err)
	}
}

func TestReadAndArchive(t *testing.T) {
	for reply, want := range map[string]string{`true`: `{"changed":true}`, `false`: `{"changed":false}`, `null`: `{"changed":false}`} {
		db := &fakeDB{reply: reply}
		_, got, err := run(t, db, `{"op":"read","conversationId":"`+conv+`","seenUpTo":"`+seen+`"}`)
		if err != nil || got != want {
			t.Errorf("%s: %s %v", reply, got, err)
		}
		if db.calls[0] != `agent_mark_conversation_read {"p_agent_id":"`+agentID+`","p_conversation_id":"`+conv+`","p_seen_up_to":"`+seen+`"}` {
			t.Errorf("call %s", db.calls[0])
		}
	}
	upper := strings.ToUpper(conv)
	for reply, want := range map[string]string{`2`: `{"moved":2,"requested":2}`, `null`: `{"moved":0,"requested":2}`} {
		db := &fakeDB{reply: reply}
		_, got, err := run(t, db, `{"op":"archive","conversationIds":["`+conv+`","`+upper+`","`+client+`"],"archived":true}`)
		if err != nil || got != want {
			t.Errorf("%s: %s %v", reply, got, err)
		}
		if db.calls[0] != `agent_set_conversations_archived {"p_agent_id":"`+agentID+`","p_conversation_ids":["`+conv+`","`+client+`"],"p_archived":true}` {
			t.Errorf("call %s", db.calls[0])
		}
	}
}
