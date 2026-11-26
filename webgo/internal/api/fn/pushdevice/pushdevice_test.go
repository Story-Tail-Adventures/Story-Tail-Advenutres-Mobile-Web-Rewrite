package pushdevice

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// fakeDB records each RPC and answers with reply (JSON) or err.
type fakeDB struct {
	calls []string // "fn args-json"
	reply string
	err   error
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	b, err := js.Marshal(args)
	if err != nil {
		return err
	}
	f.calls = append(f.calls, fn+" "+string(b))
	if f.err != nil {
		return f.err
	}
	return json.Unmarshal([]byte(f.reply), out)
}

var (
	now  = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	ctxt = &caller.Context{PlatformUserID: "pu-1", Role: "agent"}
)

const (
	endpoint = "https://fcm.googleapis.com/fcm/send/abc:def"
	p256dh   = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	auth     = "BTBZMqHH6r4Tts7J_aSIgg"
	fcmToken = "dGVzdC10b2tlbi0xMjM0NTY3ODkw:APA91b-x_y"
)

func run(t *testing.T, db *fakeDB, agentErr error, body string) (string, error) {
	t.Helper()
	payload, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("test body: %v", err)
	}
	reply, err := handle(context.Background(), db, ctxt, func() error { return agentErr }, payload, now)
	if err != nil {
		return "", err
	}
	if reply.Status != 200 {
		t.Fatalf("status %d", reply.Status)
	}
	b, err := js.Marshal(reply.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b), nil
}

func detail(err error) string {
	if p, ok := problem.As(err); ok {
		return p.Detail
	}
	return "500:" + err.Error()
}

func TestRegisterAndUnregister(t *testing.T) {
	id := uuid.NewAt(now)
	cases := []struct {
		name, body, reply string
		dbErr             error
		want, call        string
	}{
		{
			name:  "android, label trimmed and cut to 80",
			body:  `{"op":"register","deviceId":"` + id + `","platform":"android","fcmToken":"` + fcmToken + `","label":"  ` + strings.Repeat("p", 90) + ` "}`,
			reply: `"` + id + `"`,
			want:  `{"outcome":"registered","deviceId":"` + id + `"}`,
			call: `push_register_device {"p_user_id":"pu-1","p_device_id":"` + id + `","p_platform":"android","p_fcm_token":"` +
				fcmToken + `","p_label":"` + strings.Repeat("p", 80) + `"}`,
		},
		{
			name:  "web, no label: the argument is left out",
			body:  `{"op":"register","deviceId":"` + id + `","platform":"web","subscription":{"endpoint":"` + endpoint + `","keys":{"p256dh":"` + p256dh + `","auth":"` + auth + `"}}}`,
			reply: `"0195a2c0-1a00-7000-8000-0000000000b0"`,
			want:  `{"outcome":"registered","deviceId":"0195a2c0-1a00-7000-8000-0000000000b0"}`,
			call: `push_register_device {"p_user_id":"pu-1","p_device_id":"` + id + `","p_platform":"web","p_web_endpoint":"` +
				endpoint + `","p_web_p256dh":"` + p256dh + `","p_web_auth":"` + auth + `"}`,
		},
		{
			name:  "a null or blank label is no label",
			body:  `{"op":"register","deviceId":"` + id + `","platform":"android","fcmToken":"` + fcmToken + `","label":"   "}`,
			reply: `"` + id + `"`,
			want:  `{"outcome":"registered","deviceId":"` + id + `"}`,
			call:  `push_register_device {"p_user_id":"pu-1","p_device_id":"` + id + `","p_platform":"android","p_fcm_token":"` + fcmToken + `"}`,
		},
		{
			name:  "the id is some other device's",
			body:  `{"op":"register","deviceId":"` + id + `","platform":"android","fcmToken":"` + fcmToken + `"}`,
			dbErr: &service.Error{Status: 400, Code: "P0001", Message: "that device id is already in use"},
			want:  "That page is out of date. Reload it and try again.",
		},
		{
			name:  "any other database error is a 500",
			body:  `{"op":"register","deviceId":"` + id + `","platform":"android","fcmToken":"` + fcmToken + `"}`,
			dbErr: &service.Error{Status: 400, Code: "P0001", Message: "notifications are for advisors in this stage"},
			want:  "500:push register failed: notifications are for advisors in this stage",
		},
		{
			name:  "unregister a browser",
			body:  `{"op":"unregister","endpoint":"` + endpoint + `"}`,
			reply: `1`,
			want:  `{"outcome":"unregistered"}`,
			call:  `push_unregister_device {"p_user_id":"pu-1","p_web_endpoint":"` + endpoint + `"}`,
		},
		{
			name:  "unregister a phone, nothing there",
			body:  `{"op":"unregister","fcmToken":"` + fcmToken + `","endpoint":""}`,
			reply: `0`,
			want:  `{"outcome":"not_found"}`,
			call:  `push_unregister_device {"p_user_id":"pu-1","p_fcm_token":"` + fcmToken + `"}`,
		},
		{
			name:  "unregister both, endpoint first",
			body:  `{"fcmToken":"` + fcmToken + `","endpoint":"` + endpoint + `","op":"unregister"}`,
			reply: `2`,
			want:  `{"outcome":"unregistered"}`,
			call:  `push_unregister_device {"p_user_id":"pu-1","p_web_endpoint":"` + endpoint + `","p_fcm_token":"` + fcmToken + `"}`,
		},
		{
			name:  "unregister: a 4097-unit endpoint is left out",
			body:  `{"op":"unregister","fcmToken":"` + fcmToken + `","endpoint":"` + strings.Repeat("e", 4097) + `"}`,
			reply: `0`,
			want:  `{"outcome":"not_found"}`,
			call:  `push_unregister_device {"p_user_id":"pu-1","p_fcm_token":"` + fcmToken + `"}`,
		},
		{
			name:  "unregister database error",
			body:  `{"op":"unregister","fcmToken":"x"}`,
			dbErr: errors.New("boom"),
			want:  "500:push unregister failed: boom",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db := &fakeDB{reply: c.reply, err: c.dbErr}
			got, err := run(t, db, nil, c.body)
			if err != nil {
				got = detail(err)
			}
			if got != c.want {
				t.Errorf("got  %s\nwant %s", got, c.want)
			}
			if c.call != "" && (len(db.calls) != 1 || db.calls[0] != c.call) {
				t.Errorf("calls %v\nwant  %s", db.calls, c.call)
			}
		})
	}
}

// Every refusal, in the order the Deno function checks them. None reaches the database.
func TestRefusals(t *testing.T) {
	id := uuid.NewAt(now)
	old := uuid.NewAt(now.Add(-2 * time.Hour))
	reg := func(rest string) string { return `{"op":"register",` + rest + `}` }
	agentRefusal := problem.Forbidden(agent.MFARequired)
	cases := []struct {
		name, body string
		agentErr   error
		want       string
	}{
		{"no op", `{}`, nil, "Send an op of register or unregister."},
		{"an unknown op", `{"op":"remove"}`, nil, "Send an op of register or unregister."},
		{"an op that is not text", `{"op":["register"]}`, nil, "Send an op of register or unregister."},
		// The advisor check comes before anything in the body is read.
		{"register by a non-advisor", reg(`"deviceId":5`), agentRefusal, agent.MFARequired},
		{"no device id", reg(`"platform":"android"`), nil, "Send the device with its id."},
		{"a device id that is a number", reg(`"deviceId":7`), nil, "Send the device with its id."},
		{"a v4 device id", reg(`"deviceId":"2f1c7e9a-3b4d-4c5e-8f6a-7b8c9d0e1f2a"`), nil, "That page is out of date. Reload it and try again."},
		{"an old v7 device id", reg(`"deviceId":"` + old + `"`), nil, "That page is out of date. Reload it and try again."},
		{"a label that is not text", reg(`"deviceId":"` + id + `","label":5,"platform":"ios"`), nil, "label must be text."},
		{"no platform", reg(`"deviceId":"` + id + `"`), nil, "Send a platform of web or android."},
		{"ios", reg(`"deviceId":"` + id + `","platform":"ios","fcmToken":"` + fcmToken + `"`), nil, "Send a platform of web or android."},
		{"web, endpoint off the list", reg(`"deviceId":"` + id + `","platform":"web","subscription":{"endpoint":"http://10.0.0.1/x","keys":{"p256dh":"` + p256dh + `","auth":"` + auth + `"}}`), nil,
			"This browser's notification address isn't one we can send to."},
		{"web, no subscription", reg(`"deviceId":"` + id + `","platform":"web"`), nil, "This browser's notification address isn't one we can send to."},
		{"web, keys missing", reg(`"deviceId":"` + id + `","platform":"web","subscription":{"endpoint":"` + endpoint + `"}`), nil,
			"This browser's notification keys are missing."},
		{"android, token too short", reg(`"deviceId":"` + id + `","platform":"android","fcmToken":"short"`), nil, "This phone's notification token is missing."},
		{"android, no token", reg(`"deviceId":"` + id + `","platform":"android"`), nil, "This phone's notification token is missing."},
		{"unregister with nothing", `{"op":"unregister"}`, nil, "Send the address to turn off."},
		{"unregister with empty text", `{"op":"unregister","endpoint":"","fcmToken":""}`, nil, "Send the address to turn off."},
		{"unregister with a number", `{"op":"unregister","fcmToken":12345678901234567890}`, nil, "Send the address to turn off."},
		{"unregister with too long", `{"op":"unregister","endpoint":"` + strings.Repeat("e", 4097) + `"}`, nil, "Send the address to turn off."},
		// unregister needs no advisor: an archived one must still be able to turn theirs off.
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db := &fakeDB{}
			_, err := run(t, db, c.agentErr, c.body)
			if err == nil {
				t.Fatal("no error")
			}
			p, ok := problem.As(err)
			if !ok {
				t.Fatalf("not a problem: %v", err)
			}
			wantStatus := 400
			if c.agentErr != nil {
				wantStatus = 403
			}
			if p.Detail != c.want || p.Status != wantStatus {
				t.Errorf("got %d %q, want %d %q", p.Status, p.Detail, wantStatus, c.want)
			}
			if len(db.calls) != 0 {
				t.Errorf("reached the database: %v", db.calls)
			}
		})
	}
}

func TestUnregisterNeedsNoAdvisor(t *testing.T) {
	db := &fakeDB{reply: `0`}
	got, err := run(t, db, problem.Forbidden("This advisor account is closed."), `{"op":"unregister","fcmToken":"`+fcmToken+`"}`)
	if err != nil || got != `{"outcome":"not_found"}` {
		t.Fatalf("got %s %v", got, err)
	}
}
