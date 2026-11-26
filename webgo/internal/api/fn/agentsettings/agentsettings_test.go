package agentsettings

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// fakeDB records every call in order: "rpc fn args", "upload key type cache upsert",
// "remove keys".
type fakeDB struct {
	reply     string
	rpcErr    error
	uploadErr error
	log       []string
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	b, _ := js.Marshal(args)
	f.log = append(f.log, "rpc "+fn+" "+string(b))
	if f.rpcErr != nil {
		return f.rpcErr
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

func (f *fakeDB) Upload(_ context.Context, bucket, key string, data []byte, opt service.UploadOptions) error {
	f.log = append(f.log, "upload "+bucket+"/"+key+" "+opt.ContentType+" "+opt.CacheControl)
	return f.uploadErr
}

func (f *fakeDB) Remove(_ context.Context, bucket string, keys []string) error {
	f.log = append(f.log, "remove "+bucket+" "+strings.Join(keys, ","))
	return errors.New("removes are not read")
}

const agentID = "a0000000-0000-7000-8000-000000000001"

var (
	now   = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	ua    = "phone/1"
	actor = &caller.Context{PlatformUserID: "pu-1", Role: "agent", UserAgent: &ua}
	png   = base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\nrest"))
)

const audit = `"p_audit_id":"id-1","p_actor_user_id":"pu-1","p_ip":null,"p_user_agent":"phone/1"`

func run(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	n := 0
	newID = func() string { n++; return "id-" + string(rune('0'+n)) }
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := handle(context.Background(), db, actor, agentID, v, now)
	if err != nil {
		return "", err
	}
	b, _ := js.Marshal(reply.Body)
	return string(b), nil
}

func want(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != status || p.Detail != detail {
		t.Errorf("got %v, want %d %q", err, status, detail)
	}
}

func TestValidationOrder(t *testing.T) {
	week := `{"mon":null,"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null}`
	cases := []struct{ body, detail string }{
		{`{}`, "That request wasn't one we recognize. Reload the page and try again."},
		{`{"op":"update_profile"}`, "Add the name clients will see."},
		{`{"op":"update_profile","displayName":"A","pronouns":5,"phone":"x"}`, "Pronouns didn't come through. Reload and try again."},
		{`{"op":"update_profile","displayName":"A","phone":"12","bio":5}`, "That phone number doesn't look right. Use digits, spaces, + - ( ) or ."},
		{`{"op":"update_profile","displayName":"A","bio":"` + strings.Repeat("b", 601) + `"}`, "Bio can be up to 600 characters."},
		{`{"op":"update_profile","displayName":"A","socialLinks":{"tiktok":"x"}}`, "We don't have a spot for that link yet."},
		{`{"op":"set_avatar"}`, "Choose a photo first."},
		{`{"op":"set_avatar","image":"R0lGODlh"}`, "Use a JPG, PNG or WebP photo."},
		{`{"op":"update_availability","timeZone":"Europe/London"}`, "Pick a time zone from the list."},
		{`{"op":"update_availability","timeZone":"America/Chicago","weeklySchedule":[]}`, "Set hours for each day, or mark it Off."},
		{`{"op":"update_availability","timeZone":"America/Chicago","weeklySchedule":` + week + `,"responseTimeHours":3}`, "Pick how soon you usually reply from the list."},
		{`{"op":"save_time_off","timeOffId":"x"}`, "That time away didn't come through. Reload the page and try again."},
		{`{"op":"save_time_off","timeOffId":"` + uuid.NewAt(now.Add(-2*time.Hour)) + `","isNew":true}`, "This page is a little out of date. Reload and try again."},
		{`{"op":"save_time_off","timeOffId":"` + uuid.NewAt(now.Add(-2*time.Hour)) + `","isNew":"yes","startsOn":"2026-02-30"}`, "The first day away isn't a real date."},
		{`{"op":"save_time_off","timeOffId":"` + agentID + `","startsOn":"2026-12-01","endsOn":"2026-12-02","autoReplyEnabled":1}`, "The automatic reply didn't come through. Reload and try again."},
		{`{"op":"save_time_off","timeOffId":"` + agentID + `","startsOn":"2026-12-01","endsOn":"2026-12-02","label":"` + strings.Repeat("l", 81) + `"}`, "The label can be up to 80 characters."},
		{`{"op":"update_notifications","clientMessagesPush":true,"clientMessagesEmail":true,"quoteRequestsPush":null}`, "New inquiries and messages push didn't come through. Reload and try again."},
		{`{"op":"update_signature","signature":"{{agent.title}}"}`, "We don't have a {{agent.title}} field. You can use {{agent.name}}, {{agent.phone}} or {{agent.email}}."},
		{`{"op":"end_time_off","timeOffId":null}`, "That time away didn't come through. Reload the page and try again."},
	}
	for _, c := range cases {
		db := &fakeDB{}
		_, err := run(t, db, c.body)
		want(t, err, 400, c.detail)
		if len(db.log) != 0 {
			t.Errorf("%s reached the database: %v", c.body, db.log)
		}
	}
}

func TestScalarWrites(t *testing.T) {
	db := &fakeDB{reply: `"updated"`}
	got, err := run(t, db, `{"op":"update_profile","displayName":" Gyasi ","phone":"+1 555 0100","socialLinks":{"instagram":"@story.tail"}}`)
	if err != nil || got != `{"outcome":"updated"}` {
		t.Fatalf("%s %v", got, err)
	}
	if db.log[0] != `rpc agent_settings_update_profile {"p_agent_id":"`+agentID+`","p_display_name":"Gyasi","p_pronouns":null,`+
		`"p_phone":"+1 555 0100","p_bio":null,"p_social_links":{"instagram":"https://instagram.com/story.tail"},`+audit+`}` {
		t.Errorf("call %s", db.log[0])
	}

	for reply, ok := range map[string]bool{`"unchanged"`: true, `"not_found"`: false, `null`: false, `""`: false, `["updated"]`: false} {
		db := &fakeDB{reply: reply}
		got, err := run(t, db, `{"op":"update_signature","signature":"  \n"}`)
		if ok {
			if err != nil || got != `{"outcome":"unchanged"}` {
				t.Errorf("%s: %s %v", reply, got, err)
			}
		} else {
			want(t, err, 404, noProfile)
		}
		if db.log[0] != `rpc agent_settings_update_signature {"p_agent_id":"`+agentID+`","p_signature":null,`+audit+`}` {
			t.Errorf("call %s", db.log[0])
		}
	}

	db = &fakeDB{reply: `"updated"`}
	_, _ = run(t, db, `{"op":"update_notifications","clientMessagesPush":true,"clientMessagesEmail":false,"quoteRequestsPush":false,"quoteRequestsEmail":true}`)
	if db.log[0] != `rpc agent_settings_update_notifications {"p_agent_id":"`+agentID+`","p_client_messages_push":true,"p_client_messages_email":false,`+
		`"p_quote_requests_push":false,"p_quote_requests_email":true,`+audit+`}` {
		t.Errorf("call %s", db.log[0])
	}

	db = &fakeDB{reply: `"updated"`}
	_, _ = run(t, db, `{"op":"update_availability","timeZone":"America/Chicago","responseTimeHours":4,"weeklySchedule":`+
		`{"sun":null,"mon":{"start":"09:00","end":"17:30"},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null}}`)
	if db.log[0] != `rpc agent_settings_update_availability {"p_agent_id":"`+agentID+`","p_time_zone":"America/Chicago",`+
		`"p_weekly_schedule":{"mon":{"start":"09:00","end":"17:30"},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null},`+
		`"p_response_time_hours":4,`+audit+`}` {
		t.Errorf("call %s", db.log[0])
	}

	db = &fakeDB{rpcErr: errors.New("boom")}
	_, err = run(t, db, `{"op":"update_signature"}`)
	if _, isProblem := problem.As(err); err == nil || isProblem || !strings.HasPrefix(err.Error(), "signature update failed: ") {
		t.Errorf("want a bare 500, got %v", err)
	}
}

func TestSetAvatar(t *testing.T) {
	key := agentID + "/id-2.png"
	path := "/storage/v1/object/public/agent-avatars/" + key
	old := "/storage/v1/object/public/agent-avatars/" + agentID + "/0195a2c0-1a00-7000-8000-000000000999.jpg"

	db := &fakeDB{reply: `[{"outcome":"updated","previous_url":"` + old + `"}]`}
	got, err := run(t, db, `{"op":"set_avatar","image":"`+png+`"}`)
	if err != nil || got != `{"outcome":"updated","avatarPath":"`+path+`"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantLog := []string{
		"upload agent-avatars/" + key + " image/png 31536000",
		`rpc agent_settings_set_avatar {"p_agent_id":"` + agentID + `","p_avatar_url":"` + path + `",` + audit + `}`,
		"remove agent-avatars " + agentID + "/0195a2c0-1a00-7000-8000-000000000999.jpg",
	}
	if strings.Join(db.log, "\n") != strings.Join(wantLog, "\n") {
		t.Errorf("log\n%s", strings.Join(db.log, "\n"))
	}

	// Someone else's folder is never deleted from.
	db = &fakeDB{reply: `[{"outcome":"updated","previous_url":"/storage/v1/object/public/agent-avatars/b0000000-0000-7000-8000-000000000001/0195a2c0-1a00-7000-8000-000000000999.jpg"}]`}
	_, _ = run(t, db, `{"op":"set_avatar","image":"`+png+`"}`)
	if len(db.log) != 2 {
		t.Errorf("log %v", db.log)
	}

	db = &fakeDB{uploadErr: errors.New("full")}
	_, err = run(t, db, `{"op":"set_avatar","image":"`+png+`"}`)
	if err == nil || !strings.HasPrefix(err.Error(), "avatar upload failed: ") || len(db.log) != 1 {
		t.Errorf("upload failure: %v %v", err, db.log)
	}

	db = &fakeDB{reply: `[{"outcome":"not_found","previous_url":null}]`}
	_, err = run(t, db, `{"op":"set_avatar","image":"`+png+`"}`)
	want(t, err, 404, noProfile)
	if db.log[len(db.log)-1] != "remove agent-avatars "+key {
		t.Errorf("the new object stays behind: %v", db.log)
	}

	db = &fakeDB{rpcErr: errors.New("boom")}
	_, err = run(t, db, `{"op":"set_avatar","image":"`+png+`"}`)
	if err == nil || !strings.HasPrefix(err.Error(), "avatar update failed: ") || db.log[len(db.log)-1] != "remove agent-avatars "+key {
		t.Errorf("rpc failure: %v %v", err, db.log)
	}
}

func TestRemoveAvatar(t *testing.T) {
	old := "/storage/v1/object/public/agent-avatars/" + agentID + "/0195a2c0-1a00-7000-8000-000000000999.webp"
	db := &fakeDB{reply: `[{"outcome":"updated","previous_url":"` + old + `"}]`}
	got, err := run(t, db, `{"op":"remove_avatar"}`)
	if err != nil || got != `{"outcome":"updated"}` {
		t.Fatalf("%s %v", got, err)
	}
	if db.log[0] != `rpc agent_settings_set_avatar {"p_agent_id":"`+agentID+`","p_avatar_url":null,`+audit+`}` ||
		db.log[1] != "remove agent-avatars "+agentID+"/0195a2c0-1a00-7000-8000-000000000999.webp" {
		t.Errorf("log %v", db.log)
	}
	db = &fakeDB{reply: `[{"outcome":"unchanged","previous_url":null}]`}
	got, _ = run(t, db, `{"op":"remove_avatar"}`)
	if got != `{"outcome":"unchanged"}` || len(db.log) != 1 {
		t.Errorf("%s %v", got, db.log)
	}
	db = &fakeDB{reply: `[]`}
	_, err = run(t, db, `{"op":"remove_avatar"}`)
	want(t, err, 404, noProfile)
}

func TestTimeOff(t *testing.T) {
	id := uuid.NewAt(now.Add(-time.Minute))
	body := `{"op":"save_time_off","timeOffId":"` + id + `","isNew":true,"startsOn":"2026-12-01","endsOn":"2026-12-05",` +
		`"label":" Family ","autoReplyEnabled":true,"autoReplyText":" Back {{ return_date }} "}`
	db := &fakeDB{reply: `"created"`}
	got, err := run(t, db, body)
	if err != nil || got != `{"outcome":"created","timeOffId":"`+id+`"}` {
		t.Fatalf("%s %v", got, err)
	}
	if db.log[0] != `rpc agent_settings_save_time_off {"p_id":"`+id+`","p_agent_id":"`+agentID+`","p_is_new":true,`+
		`"p_starts_on":"2026-12-01","p_ends_on":"2026-12-05","p_label":"Family","p_auto_reply_enabled":true,`+
		`"p_auto_reply_text":"Back {{ return_date }}",`+audit+`}` {
		t.Errorf("call %s", db.log[0])
	}
	for reply, w := range map[string]struct {
		status int
		detail string
	}{
		`"overlap"`:          {409, "Those dates overlap time away you've already set. Pick different days."},
		`"starts_in_past"`:   {400, "Time away can start today or later."},
		`"started"`:          {409, "This time away has already started. You can end it early instead."},
		`"bad_dates"`:        {400, "The last day away can't be before the first."},
		`"reply_needs_text"`: {400, "Add the words for your automatic reply, or turn it off."},
		`"conflict"`:         {404, noTimeOff},
		`"not_found"`:        {404, noTimeOff},
		`null`:               {404, noTimeOff},
	} {
		_, err := run(t, &fakeDB{reply: reply}, body)
		want(t, err, w.status, w.detail)
	}

	end := `{"op":"end_time_off","timeOffId":"` + id + `","isNew":true}`
	for reply, w := range map[string]struct {
		status int
		out    string
	}{
		`"deleted"`: {0, `{"outcome":"deleted"}`}, `"ended"`: {0, `{"outcome":"ended"}`},
		`"past"`: {409, "That time away is already over."}, `"not_found"`: {404, noTimeOff}, `5`: {404, noTimeOff},
	} {
		db := &fakeDB{reply: reply}
		got, err := run(t, db, end)
		if w.status == 0 {
			if err != nil || got != w.out {
				t.Errorf("%s: %s %v", reply, got, err)
			}
		} else {
			want(t, err, w.status, w.out)
		}
		if db.log[0] != `rpc agent_settings_end_time_off {"p_id":"`+id+`","p_agent_id":"`+agentID+`",`+audit+`}` {
			t.Errorf("call %s", db.log[0])
		}
	}
}
